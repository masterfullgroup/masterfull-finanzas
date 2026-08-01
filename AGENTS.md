# Instrucciones para Codex

## Palabra clave: Comprobar y publicar

Cuando el usuario escriba “Comprobar y publicar”, realiza obligatoriamente lo siguiente:

1. Revisa todos los cambios realizados.
2. Ejecuta `git status`.
3. Comprueba que no se publiquen archivos privados, contraseñas, tokens, `.env`, `db.sqlite3` ni datos sensibles.
4. Comprueba el proyecto Django ejecutando:
   `python manage.py check`
5. Ejecuta las pruebas disponibles mediante:
   `python manage.py test`
6. Si existe algún error, no publiques. Informa cuál es el problema y corrígelo si corresponde a la tarea solicitada.
7. Si las comprobaciones terminan correctamente, agrega únicamente los archivos relacionados con el trabajo realizado.
8. Crea un commit con un mensaje descriptivo en español.
9. Publica los cambios ejecutando:
   `git push origin main`
10. Finalmente, informa:
    - el resultado de las comprobaciones;
    - los archivos publicados;
    - el mensaje del commit;
    - si la publicación en GitHub fue exitosa.

No elimines ni reviertas cambios del usuario que no estén relacionados con la tarea.