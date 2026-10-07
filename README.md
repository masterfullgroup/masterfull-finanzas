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

`users/{uid}` (perfil) y subcolecciones `cuentas`, `tarjetas`, `personas`, `propietarios`, `instituciones`, `categorias`, `movimientos`, `presupuestos`, `metas`, `deudas`, `recurrentes`, `transferencias` y `pagosTarjeta`.

El resumen pagina sus listas, limita los datos de pantalla y usa agregaciones del servidor para totales mensuales filtrados por tipo, moneda y fecha. Las listas cargan páginas de 50 documentos; las referencias del formulario cargan como máximo 100 por entidad. No hay listeners en tiempo real. Si crecen más allá de ese límite las referencias deberán contar con búsqueda/paginación dedicada. Firestore puede solicitar índices adicionales si se agregan filtros compuestos; el mensaje de error incluye un enlace para crearlos y el índice debe documentarse aquí antes de desplegarlo.

## Ejecución local

No requiere Django, Python ni instalar dependencias en el repositorio. Completa primero `firebase-config.js` y publica la carpeta con un servidor estático (por ejemplo, la extensión Live Server de VS Code o `npx http-server .`). Abre la URL local, habilitada como dominio autorizado en Firebase. Abrir `index.html` directamente como `file://` no funciona porque los módulos ES requieren un servidor HTTP.

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

El proyecto original no contiene datos de usuario que migrar. Los archivos Django/Render/Supabase permanecen durante la validación del nuevo despliegue; se retirarán solo después de comprobar autenticación, Firestore y Storage contra el proyecto Firebase real.
