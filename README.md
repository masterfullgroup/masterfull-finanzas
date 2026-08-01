# Masterfull Finanzas

Aplicación Django para organizar cuentas, tarjetas, personas, movimientos, presupuestos, metas, deudas y reportes financieros.

## Desarrollo local

Requiere Python 3.11 o posterior.

```bash
python -m venv venv
```

En Windows:

```powershell
venv\Scripts\activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

En macOS o Linux:

```bash
source venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Cuando `DATABASE_URL` no está definida, el proyecto usa `db.sqlite3` para desarrollo local. Este archivo está excluido de Git.

## Variables de entorno

| Variable | Producción | Ejemplo o finalidad |
| --- | --- | --- |
| `DATABASE_URL` | Obligatoria | Cadena PostgreSQL proporcionada por Supabase. |
| `SECRET_KEY` | Obligatoria | Clave aleatoria y privada de Django. |
| `DEBUG` | Obligatoria | Usar `False` en producción. |
| `ALLOWED_HOSTS` | Obligatoria | Hosts separados por comas, sin `https://`. |
| `CSRF_TRUSTED_ORIGINS` | Obligatoria | Orígenes completos separados por comas, incluyendo `https://`. |

Ejemplo local opcional, sin credenciales reales:

```env
DEBUG=True
SECRET_KEY=clave-solo-para-desarrollo
ALLOWED_HOSTS=127.0.0.1,localhost
CSRF_TRUSTED_ORIGINS=http://127.0.0.1:8000,http://localhost:8000
```

No agregues `.env`, conexiones de Supabase, certificados, contraseñas ni tokens al repositorio.

## Base de datos PostgreSQL en Supabase

1. Crea un proyecto en Supabase.
2. Abre **Connect** en el panel del proyecto.
3. Para un servicio persistente como Render, copia preferentemente la conexión de **Session pooler** si necesitas compatibilidad IPv4. La conexión directa requiere conectividad IPv6 o el complemento IPv4 de Supabase.
4. Conserva los parámetros SSL de la URL. La configuración de Django también exige SSL cuando existe `DATABASE_URL`.
5. Guarda la cadena completa únicamente en la variable privada `DATABASE_URL` de Render.

No escribas la URL real en `render.yaml`, el código, el README ni archivos versionados.

## Despliegue en Render

El archivo `render.yaml` define un Web Service sobre la rama `main` con:

- compilación: `bash build.sh`;
- inicio: `gunicorn config.wsgi:application`;
- archivos estáticos servidos por WhiteNoise;
- migraciones ejecutadas durante la compilación.

Para desplegar:

1. Publica el repositorio en GitHub cuando la revisión esté aprobada.
2. En Render, selecciona **New → Blueprint** y conecta este repositorio.
3. Render leerá `render.yaml` desde la raíz.
4. Introduce estos valores cuando Render los solicite:
   - `DATABASE_URL`: conexión PostgreSQL privada de Supabase;
   - `ALLOWED_HOSTS`: dominio asignado por Render, por ejemplo `masterfull-finanzas.onrender.com`;
   - `CSRF_TRUSTED_ORIGINS`: el mismo dominio con esquema, por ejemplo `https://masterfull-finanzas.onrender.com`.
5. `SECRET_KEY` será generada automáticamente por Render y `DEBUG` quedará en `False`.
6. Aplica el Blueprint y espera que finalicen instalación, `collectstatic` y migraciones.
7. Si necesitas administración, ejecuta `python manage.py createsuperuser` desde la Shell de Render.

Si se agrega un dominio propio, añádelo también a `ALLOWED_HOSTS` y su URL HTTPS a `CSRF_TRUSTED_ORIGINS`, separados por comas.

## Comprobaciones antes de publicar

```bash
python manage.py check
python manage.py test
python manage.py collectstatic --no-input
```

Revisa además `git status` y confirma que no aparezcan `.env`, `db.sqlite3`, certificados ni otros archivos privados.
