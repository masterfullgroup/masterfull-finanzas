from django.urls import path

from . import views


urlpatterns = [
    path(
        "",
        views.inicio,
        name="inicio",
    ),
    path("registro/", views.registro, name="registro"),
    path(
        "dashboard/",
        views.dashboard,
        name="dashboard",
    ),

    # Personas
    path("personas/", views.personas_lista, name="personas_lista"),
    path("personas/nueva/", views.persona_crear, name="persona_crear"),
    path("personas/<int:pk>/", views.persona_detalle, name="persona_detalle"),
    path("personas/<int:pk>/editar/", views.persona_editar, name="persona_editar"),

    # Cuentas
    path(
        "cuentas/",
        views.cuentas_lista,
        name="cuentas_lista",
    ),
    path(
        "cuentas/nueva/",
        views.cuenta_crear,
        name="cuenta_crear",
    ),
    path(
        "cuentas/<int:pk>/editar/",
        views.cuenta_editar,
        name="cuenta_editar",
    ),

    # Categorías
    path(
        "categorias/",
        views.categorias_lista,
        name="categorias_lista",
    ),
    path(
        "categorias/nueva/",
        views.categoria_crear,
        name="categoria_crear",
    ),
    path(
        "categorias/<int:pk>/editar/",
        views.categoria_editar,
        name="categoria_editar",
    ),

    # Tarjetas de crédito
    path(
        "tarjetas/",
        views.tarjetas_lista,
        name="tarjetas_lista",
    ),
    path(
        "tarjetas/nueva/",
        views.tarjeta_crear,
        name="tarjeta_crear",
    ),
    path(
        "tarjetas/<int:pk>/editar/",
        views.tarjeta_editar,
        name="tarjeta_editar",
    ),

    # Movimientos
    path(
        "movimientos/",
        views.movimientos_lista,
        name="movimientos_lista",
    ),
    path(
        "movimientos/nuevo/",
        views.movimiento_crear,
        name="movimiento_crear",
    ),
    path(
        "movimientos/<int:pk>/editar/",
        views.movimiento_editar,
        name="movimiento_editar",
    ),
    path(
        "movimientos/<int:pk>/eliminar/",
        views.movimiento_eliminar,
        name="movimiento_eliminar",
    ),

    # Transferencias
    path(
        "transferencias/",
        views.transferencias_lista,
        name="transferencias_lista",
    ),
    path(
        "transferencias/nueva/",
        views.transferencia_crear,
        name="transferencia_crear",
    ),

    # Pagos de tarjetas
    path(
        "pagos-tarjetas/",
        views.pagos_tarjetas_lista,
        name="pagos_tarjetas_lista",
    ),
    path(
        "pagos-tarjetas/nuevo/",
        views.pago_tarjeta_crear,
        name="pago_tarjeta_crear",
    ),

    # Gastos recurrentes
    path(
        "gastos-recurrentes/",
        views.gastos_recurrentes_lista,
        name="gastos_recurrentes_lista",
    ),
    path(
        "gastos-recurrentes/nuevo/",
        views.gasto_recurrente_crear,
        name="gasto_recurrente_crear",
    ),
    path(
        "gastos-recurrentes/<int:pk>/editar/",
        views.gasto_recurrente_editar,
        name="gasto_recurrente_editar",
    ),

    # Presupuestos
    path(
        "presupuestos/",
        views.presupuestos_lista,
        name="presupuestos_lista",
    ),
    path(
        "presupuestos/nuevo/",
        views.presupuesto_crear,
        name="presupuesto_crear",
    ),

    # Metas
    path(
        "metas/",
        views.metas_lista,
        name="metas_lista",
    ),
    path(
        "metas/nueva/",
        views.meta_crear,
        name="meta_crear",
    ),
    path(
        "metas/<int:pk>/editar/",
        views.meta_editar,
        name="meta_editar",
    ),

    # Deudas
    path(
        "deudas/",
        views.deudas_lista,
        name="deudas_lista",
    ),
    path(
        "deudas/nueva/",
        views.deuda_crear,
        name="deuda_crear",
    ),
    path(
        "deudas/<int:pk>/editar/",
        views.deuda_editar,
        name="deuda_editar",
    ),

    # Reportes
    path(
        "flujo-mensual/",
        views.flujo_mensual,
        name="flujo_mensual",
    ),
    path(
        "reportes/",
        views.reportes,
        name="reportes",
    ),
]
