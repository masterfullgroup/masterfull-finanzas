# Masterfull Finanzas

Aplicación web estática para administrar finanzas personales. La interfaz usa HTML, CSS y JavaScript modular; Firebase proporciona autenticación y persistencia. GitHub Pages sirve el frontend bajo `https://masterfullgroup.github.io/masterfull-finanzas/`.

## Arquitectura

- Firebase Authentication con correo y contraseña, recuperación y cambio de contraseña.
- Cloud Firestore con datos bajo `users/{uid}` y subcolecciones privadas por usuario.
- Los comprobantes están temporalmente desactivados. Si `storageBucket` no se configura, la aplicación no carga el SDK de Storage y permite guardar movimientos sin adjuntos. Al habilitar Storage podrá guardar imágenes/PDF (máximo 10 MB) en `users/{uid}/comprobantes/{movementId}/...`.
- `firestore.rules` restringe Firestore al UID autenticado; `firestore.indexes.json` contiene los índices compuestos de las consultas. `storage.rules` queda listo para el futuro y no se despliega mientras Storage esté desactivado.
- `firebase-config.js` contiene exclusivamente la configuración pública del SDK web. Nunca incluir service account keys ni credenciales administrativas.
- Los importes se persisten como enteros en unidades menores (`montoMinor`, `saldoActualMinor`, etc.). Fechas de operación son cadenas `YYYY-MM-DD` interpretadas como fechas civiles en `America/Lima`; no convertirlas a UTC para agrupar meses.

## Preparación de Firebase

1. En Firebase Console crea o selecciona un proyecto y registra una aplicación web.
2. En **Authentication → Sign-in method**, habilita **Email/Password**.
3. Crea la base de datos de **Cloud Firestore** en producción.
4. En **Authentication → Settings → Authorized domains**, añade `masterfullgroup.github.io` y `localhost` (para desarrollo local).
5. Copia `apiKey`, `authDomain`, `messagingSenderId` y `appId` desde **Project settings → General → Your apps → SDK setup and configuration** dentro de `firebase-config.js`. El `projectId` confirmado ya está configurado como `masterfull-finanzas`. No se requiere `storageBucket` mientras Storage siga desactivado. Estos son valores públicos de cliente; no pegues claves privadas ni credenciales de service account.
6. Despliega las reglas e índices de Firestore desde la raíz del repositorio:

   ```sh
   npx firebase-tools login
   npx firebase-tools deploy --project masterfull-finanzas --only firestore:rules,firestore:indexes
   ```

   Inicia sesión con una cuenta que tenga permisos de despliegue sobre el proyecto. Confirma en Console que Firestore muestra las reglas y que los índices compuestos terminaron de crearse.

### Activar comprobantes más adelante

La versión actual es compatible con Storage apagado. Para habilitar comprobantes hay que actualizar el proyecto al plan Blaze, crear el bucket y revisar facturación/tarifas; Firebase actualmente exige Blaze para crear y mantener el acceso al bucket. [Requisitos actuales de Storage](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024). Después, añade su valor `storageBucket` a `firebase-config.js` y despliega también las reglas:

```sh
npx firebase-tools deploy --project masterfull-finanzas --only storage
gcloud storage buckets update gs://EL_NOMBRE_REAL_DEL_BUCKET --cors-file=storage.cors.json
```

La vista del comprobante usa `getBlob`, que requiere configurar CORS para el origen del sitio. [Documentación oficial de descarga y CORS](https://firebase.google.com/docs/storage/web/download-files). El archivo solo permite `GET` desde GitHub Pages y Live Server en puerto 5500. Si usas otro puerto local, añádelo antes de aplicar CORS. Las reglas de Storage siguen exigiendo autenticación y UID.

## Datos y rendimiento

Los documentos pertenecen al usuario autenticado:

`users/{uid}` (perfil) y subcolecciones `cuentas`, `tarjetas`, `personas`, `propietarios`, `instituciones`, `categorias`, `movimientos`, `presupuestos`, `metas`, `deudas`, `recurrentes`, `transferencias`, `pagosTarjeta` y `eventosContables`.

### Libro de eventos y compatibilidad contable

`deudas` conserva sus campos actuales y admite `tipo_deuda` (`POR_PAGAR`/`POR_COBRAR`), `origen_saldo` (`SALDO_INICIAL`/`PRESTAMO_NUEVO`), `principal_confirmado` (boolean), `cuenta_id`, `persona_id` y `fecha_operacion`. Los importes monetarios existentes siguen codificándose en `montoTotalMinor` y `montoPagadoMinor`. En deudas antiguas esos importes no se reinterpretan automáticamente como principal: la persona debe confirmar explícitamente esa semántica antes de registrar amortizaciones. No se infiere si una deuda histórica es por pagar o cobrar ni si el importe incluye intereses previos.

`eventosContables` es append-only y registra `cuentaId`, `deudaId`, `operacionColeccion`, `operacionId`, `eventoTipo`, `montoDeltaMinor`, `deltaPrincipalMinor`, `deltaResultadoMinor`, `deltaIngresoMinor`, `deltaGastoMinor`, `moneda`, `fechaEfectiva`, `impactoResultado`, `componenteDeuda`, `eventoRelacionadoId`, `motivo`, `operacionSnapshot`, `registradoEn` y `creadoEn`. Las fechas efectivas se conservan al corregir; la hora del servidor registra cuándo se hizo la corrección. Las anulaciones agregan reversión y conservan el documento y sus comprobantes.

Una línea base `SALDO_BASE` se genera al crear una cuenta con el saldo inicial ingresado. Para cuentas existentes, la acción **Confirmar corte** registra una sola línea base si el saldo confirmado coincide con el saldo actual guardado; no cambia el saldo. Sin línea base confirmada, los saldos inicial/final de ese periodo se presentan como no disponibles. No se reconstruyen ni rellenan periodos anteriores a la fecha efectiva de corte.

Préstamos y pagos de principal generan efectivo y cambios al principal, sin ingresos/gastos reconocidos. Intereses y comisiones generan eventos separados. Las transferencias usan dos deltas de cuenta vinculados al mismo `operacionId`; el flujo consolidado excluye ambas piernas. Los documentos fuente se marcan con `eventoContableId` para que Reportes use el libro de eventos sin contar dos veces el mismo movimiento. Las operaciones heredadas sin dicho identificador continúan leyéndose desde sus colecciones actuales.

### Preparación y migración (sin ejecutar automáticamente)

1. Clasificar manualmente cada deuda antigua y confirmar si el saldo guardado representa solo principal; sin esa confirmación se permiten registros de interés/comisión, pero se bloquea la amortización de principal. Al asignar `SALDO_INICIAL` no se crea un movimiento de efectivo.
2. Confirmar por cuenta los saldos y fechas de corte. Las cuentas existentes no reciben una línea base hasta confirmarla desde **Cuentas → Confirmar corte**.
3. Revisar y respaldar la información antes de publicar. No hay backfill automático de operaciones o saldos previos: el historial mutable no permite garantizar una reconstrucción fiable.
4. Publicar primero reglas e índices aprobados, esperar a que los índices terminen de construirse y después desplegar el cliente. Esta tarea solo preparó los archivos locales.
5. Tras publicar, reconciliar los saldos de cuentas, tarjetas y deudas contra los eventos nuevos antes de confirmar el corte operativo.

Despliegue futuro, únicamente con autorización específica:

```sh
npx firebase-tools deploy --project masterfull-finanzas --only firestore:indexes
npx firebase-tools deploy --project masterfull-finanzas --only firestore:rules
```

Las reglas propuestas hacen inmutables los eventos y validan su estructura, UID y vínculos existentes. Como la arquitectura sigue siendo cliente estático, Firestore Rules no pueden probar por sí solas que un usuario no haya escrito un evento falso o alterado su propio saldo actual. La escritura normal del cliente es transaccional, pero una garantía contra manipulación del propio usuario exigiría un servicio confiable del lado del servidor y queda fuera de esta etapa.

El resumen pagina sus listas, limita los datos de pantalla y usa agregaciones del servidor para totales mensuales filtrados por tipo, moneda y fecha. Las listas cargan páginas de 50 documentos; las referencias del formulario cargan como máximo 100 por entidad. No hay listeners en tiempo real. Si crecen más allá de ese límite las referencias deberán contar con búsqueda/paginación dedicada. Firestore puede solicitar índices adicionales si se agregan filtros compuestos; el mensaje de error incluye un enlace para crearlos y el índice debe documentarse aquí antes de desplegarlo.

## Ejecución local

No requiere Django, Python ni instalar dependencias en el repositorio. Completa primero `firebase-config.js` y publica la carpeta con un servidor estático (por ejemplo, la extensión Live Server de VS Code o `npx http-server .`). Abre la URL local, habilitada como dominio autorizado en Firebase. Abrir `index.html` directamente como `file://` no funciona porque los módulos ES requieren un servidor HTTP.

### Pruebas locales de Firestore

Las reglas pueden probarse sin apuntar al proyecto real: el script usa explícitamente el proyecto ficticio `demo-masterfull-local`, y el emulador de Firestore escucha solo en `127.0.0.1:8080`. Instala Node.js, Firebase CLI y Java 21 o superior; luego ejecuta:

```sh
npm install
npm run test:finance
npm run test:indexes
npm run test:rules
```

`npm run test:rules` arranca el emulador temporalmente, aplica `firestore.rules`, ejecuta pruebas con usuarios ficticios y lo apaga. `npm test` ejecuta las tres suites. No se configura Authentication Emulator porque los tests inyectan identidades simuladas mediante `@firebase/rules-unit-testing`; tampoco se usa una cuenta Firebase real.

Para revisar los cambios de JavaScript sin conectar a Firebase:

```sh
node --input-type=module --check < app.js
node --input-type=module --check < js/firebase.js
node --input-type=module --check < js/data.js
node --input-type=module --check < js/finance.js
```

## Publicación en GitHub Pages

En GitHub abre **Settings → Pages**, configura **Deploy from a branch**, elige `main` y la carpeta `/ (root)`. La aplicación es estática y mantiene las rutas relativas para funcionar en el subdirectorio del proyecto. Después de publicar, comprueba la URL, alta e inicio de sesión, recuperación de contraseña, operaciones, paginación e informes. Los comprobantes se prueban solo cuando Cloud Storage esté habilitado.

## Seguridad y límites

Las reglas impiden a una persona autenticada leer o escribir datos de otro UID. Cuando se active Storage, sus reglas limitarán tipo y tamaño de comprobantes. La configuración web de Firebase y las reglas son públicas por diseño; la autorización real está en Firebase. Habilita protección contra abuso y monitorea cuotas. Como no hay backend confiable, un usuario puede modificar sus propios documentos directamente y las reglas no pueden demostrar que sus saldos derivados coincidan con su historial. Los cambios de movimientos/transferencias/pagos actualizan los saldos de forma atómica en transacciones del cliente, pero para auditoría financiera fuerte o integridad contra manipulación por el propio dueño se requerirían funciones de servidor.

La aplicación activa no depende de Django, Render ni Supabase. GitHub Pages sirve el cliente web, Firebase Authentication gestiona el acceso y Cloud Firestore conserva los datos privados por UID. Storage permanece desactivado en el código de cliente; conservar `storage.rules` no activa ni despliega ese servicio.
