# Masterfull Finanzas · GitHub Pages + Supabase

Esta es la nueva versión estática de Masterfull Finanzas. Conserva los módulos de la versión Django, pero se ejecuta con HTML, CSS y JavaScript en GitHub Pages. Supabase proporciona autenticación y PostgreSQL.

## Activación

1. En Supabase abre **SQL Editor**, pega y ejecuta `supabase/schema.sql`.
2. En **Project Settings → API** copia la URL del proyecto y la clave pública `anon`.
3. Completa esos dos valores en `config.js`. No uses nunca `service_role` en GitHub.
4. En GitHub abre **Settings → Pages**, elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`.

Sin configuración de Supabase, la aplicación funciona en modo demostración y guarda los cambios únicamente en el navegador mediante `localStorage`.

## Seguridad

Todas las tablas tienen Row Level Security. Cada operación exige que `auth.uid()` coincida con `user_id`, por lo que cada persona autenticada solo puede leer y modificar sus propios datos.
