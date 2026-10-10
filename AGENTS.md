# Instrucciones para Codex

## Arquitectura vigente

Masterfull Finanzas es una aplicación estática publicada con GitHub Pages. La interfaz usa HTML, CSS y módulos JavaScript; Firebase Authentication gestiona el acceso y Cloud Firestore almacena los datos por usuario. No requiere Django, Python, Render, Supabase ni un backend propio.

Conserva `firebase-config.js`, `firebase.json`, `firestore.rules`, `firestore.indexes.json` y `storage.rules`. No cambies reglas, configuración de Firebase/Google Cloud ni datos remotos sin autorización explícita. No ejecutes migraciones destructivas ni borres datos financieros.

## Palabra clave: Comprobar y publicar

Cuando el usuario escriba “Comprobar y publicar”, realiza obligatoriamente lo siguiente:

1. Revisa todos los cambios y ejecuta `git status`.
2. Comprueba que no se publiquen secretos privados, `.env`, bases locales, datos personales ni credenciales administrativas. La configuración Firebase del cliente es pública por diseño; nunca añadas claves de service account.
3. Valida la sintaxis de los módulos JavaScript del proyecto:

   ```sh
   node --input-type=module --check < app.js
   node --input-type=module --check < js/firebase.js
   node --input-type=module --check < js/data.js
   node --input-type=module --check < js/finance.js
   ```

   Ejecuta además las pruebas automatizadas del proyecto si existen y las comprobaciones estáticas pertinentes a los archivos modificados. No ejecutes Django ni instales dependencias de Python.
4. Si alguna comprobación falla, no publiques. Corrige los errores relacionados con la tarea y repite las comprobaciones.
5. Si todas pasan, prepara únicamente los archivos relacionados con el trabajo. No incluyas cambios previos del usuario que no correspondan a la tarea.
6. Crea un commit con un mensaje descriptivo en español.
7. Publica según la instrucción explícita del usuario. Para publicar en la rama principal usa `git push origin main`.
8. Comprueba el resultado del push y, cuando se haya pedido publicar el sitio, verifica que GitHub Pages sirve la versión publicada.
9. Informa las comprobaciones, archivos publicados, mensaje del commit y resultado de GitHub Pages.

No elimines ni reviertas cambios del usuario que no estén relacionados con la tarea.
