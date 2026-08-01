from django.contrib import admin

from .models import (
    Categoria,
    Cuenta,
    Deuda,
    GastoRecurrente,
    MetaAhorro,
    Movimiento,
    PagoTarjeta,
    Persona,
    Presupuesto,
    TarjetaCredito,
    Transferencia,
)


@admin.register(Persona)
class PersonaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "usuario", "relacion", "email", "activa")
    list_filter = ("relacion", "activa")
    search_fields = ("nombre", "email", "usuario__username")


@admin.register(Cuenta)
class CuentaAdmin(admin.ModelAdmin):
    list_display = (
        "nombre",
        "usuario",
        "tipo",
        "saldo_inicial",
        "moneda",
        "activa",
    )
    list_filter = (
        "tipo",
        "moneda",
        "activa",
    )
    search_fields = (
        "nombre",
        "usuario__username",
    )


@admin.register(Categoria)
class CategoriaAdmin(admin.ModelAdmin):
    list_display = (
        "nombre",
        "usuario",
        "tipo",
        "activa",
    )
    list_filter = (
        "tipo",
        "activa",
    )
    search_fields = (
        "nombre",
        "usuario__username",
    )


@admin.register(TarjetaCredito)
class TarjetaCreditoAdmin(admin.ModelAdmin):
    list_display = (
        "nombre",
        "usuario",
        "entidad",
        "linea_credito",
        "saldo_utilizado_mostrar",
        "credito_disponible_mostrar",
        "dia_cierre",
        "dia_pago",
        "activa",
    )
    list_filter = (
        "entidad",
        "moneda",
        "activa",
    )
    search_fields = (
        "nombre",
        "usuario__username",
    )

    @admin.display(
        description="Saldo utilizado"
    )
    def saldo_utilizado_mostrar(self, obj):
        return obj.saldo_utilizado

    @admin.display(
        description="Crédito disponible"
    )
    def credito_disponible_mostrar(self, obj):
        return obj.credito_disponible


@admin.register(Movimiento)
class MovimientoAdmin(admin.ModelAdmin):
    list_display = (
        "fecha",
        "usuario",
        "persona",
        "tipo",
        "categoria",
        "medio_pago",
        "cuenta",
        "tarjeta_credito",
        "monto",
        "numero_cuotas",
    )
    list_filter = (
        "tipo",
        "medio_pago",
        "fecha",
        "categoria",
    )
    search_fields = (
        "descripcion",
        "usuario__username",
        "categoria__nombre",
    )
    date_hierarchy = "fecha"


@admin.register(Transferencia)
class TransferenciaAdmin(admin.ModelAdmin):
    list_display = (
        "fecha",
        "usuario",
        "cuenta_origen",
        "cuenta_destino",
        "monto",
    )
    list_filter = (
        "fecha",
    )
    search_fields = (
        "descripcion",
        "usuario__username",
        "cuenta_origen__nombre",
        "cuenta_destino__nombre",
    )
    date_hierarchy = "fecha"


@admin.register(PagoTarjeta)
class PagoTarjetaAdmin(admin.ModelAdmin):
    list_display = (
        "fecha",
        "usuario",
        "tarjeta",
        "cuenta",
        "monto",
    )
    list_filter = (
        "fecha",
        "tarjeta",
    )
    search_fields = (
        "descripcion",
        "usuario__username",
        "tarjeta__nombre",
        "cuenta__nombre",
    )
    date_hierarchy = "fecha"


@admin.register(GastoRecurrente)
class GastoRecurrenteAdmin(admin.ModelAdmin):
    list_display = (
        "nombre",
        "usuario",
        "servicio",
        "monto_estimado",
        "frecuencia",
        "proxima_fecha",
        "medio_pago",
        "activo",
    )
    list_filter = (
        "servicio",
        "frecuencia",
        "medio_pago",
        "activo",
    )
    search_fields = (
        "nombre",
        "usuario__username",
        "categoria__nombre",
    )


@admin.register(Presupuesto)
class PresupuestoAdmin(admin.ModelAdmin):
    list_display = (
        "categoria",
        "usuario",
        "mes",
        "limite",
        "gastado_mostrar",
        "disponible_mostrar",
    )
    list_filter = (
        "mes",
        "categoria",
    )
    search_fields = (
        "categoria__nombre",
        "usuario__username",
    )

    @admin.display(
        description="Gastado"
    )
    def gastado_mostrar(self, obj):
        return obj.gastado

    @admin.display(
        description="Disponible"
    )
    def disponible_mostrar(self, obj):
        return obj.disponible


@admin.register(MetaAhorro)
class MetaAhorroAdmin(admin.ModelAdmin):
    list_display = (
        "nombre",
        "usuario",
        "monto_objetivo",
        "monto_actual",
        "porcentaje_mostrar",
        "fecha_objetivo",
        "completada",
    )
    list_filter = (
        "completada",
        "fecha_objetivo",
    )
    search_fields = (
        "nombre",
        "usuario__username",
    )

    @admin.display(
        description="Progreso"
    )
    def porcentaje_mostrar(self, obj):
        return f"{obj.porcentaje} %"


@admin.register(Deuda)
class DeudaAdmin(admin.ModelAdmin):
    list_display = (
        "acreedor",
        "usuario",
        "monto_total",
        "monto_pagado",
        "saldo_pendiente_mostrar",
        "fecha_vencimiento",
        "estado",
    )
    list_filter = (
        "estado",
        "fecha_vencimiento",
    )
    search_fields = (
        "acreedor",
        "descripcion",
        "usuario__username",
    )

    @admin.display(
        description="Saldo pendiente"
    )
    def saldo_pendiente_mostrar(self, obj):
        return obj.saldo_pendiente
