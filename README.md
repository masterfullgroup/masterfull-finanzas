# Finanzas Personales con Django

Proyecto funcional inicial para gestionar:

- Usuarios e inicio de sesión
- Dashboard financiero
- Cuentas
- Categorías
- Ingresos, gastos y transferencias
- Presupuestos
- Metas de ahorro
- Deudas
- Reportes mensuales

## Instalación

```bash
python -m venv venv
```

### Windows

```bash
venv\Scripts\activate
pip install -r requirements.txt
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Abrir:

- Plataforma: http://127.0.0.1:8000/
- Administración: http://127.0.0.1:8000/admin/

## Datos de prueba

Después de crear un usuario, inicia sesión y registra tus cuentas, categorías y movimientos.
