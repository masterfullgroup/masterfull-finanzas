from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Persona(models.Model):
    RELACION_CHOICES = [
        ("TITULAR", "Titular"),
        ("PAREJA", "Pareja"),
        ("HIJO", "Hijo/a"),
        ("FAMILIAR", "Familiar"),
        ("OTRO", "Otro"),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="personas_financieras",
    )
    nombre = models.CharField(max_length=120)
    relacion = models.CharField(max_length=12, choices=RELACION_CHOICES, default="TITULAR")
    email = models.EmailField(blank=True)
    telefono = models.CharField(max_length=20, blank=True)
    fecha_nacimiento = models.DateField(null=True, blank=True)
    color = models.CharField(max_length=7, default="#635bff")
    activa = models.BooleanField(default=True)
    creada = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nombre"]
        constraints = [
            models.UniqueConstraint(
                fields=["usuario", "nombre"],
                name="persona_unica_por_usuario",
            )
        ]

    def __str__(self):
        return self.nombre


class Categoria(models.Model):
    TIPO_CHOICES = [
        ("INGRESO", "Ingreso"),
        ("GASTO", "Gasto"),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="categorias",
    )
    nombre = models.CharField(max_length=80)
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES)
    color = models.CharField(max_length=7, default="#2563eb")
    activa = models.BooleanField(default=True)

    class Meta:
        ordering = ["tipo", "nombre"]
        constraints = [
            models.UniqueConstraint(
                fields=["usuario", "nombre", "tipo"],
                name="categoria_unica_por_usuario",
            )
        ]

    def __str__(self):
        return f"{self.nombre} ({self.get_tipo_display()})"


class Cuenta(models.Model):
    TIPO_CHOICES = [
        ("EFECTIVO", "Efectivo"),
        ("BANCO", "Cuenta bancaria"),
        ("YAPE", "Yape"),
        ("PLIN", "Plin"),
        ("BILLETERA", "Otra billetera digital"),
        ("AHORRO", "Cuenta de ahorro"),
        ("OTRO", "Otro"),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cuentas_financieras",
    )
    nombre = models.CharField(max_length=100)
    tipo = models.CharField(max_length=12, choices=TIPO_CHOICES)
    saldo_inicial = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
    )
    moneda = models.CharField(max_length=3, default="PEN")
    activa = models.BooleanField(default=True)
    creada = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre

    @property
    def saldo_actual(self):
        ingresos = self.movimientos.filter(tipo="INGRESO").aggregate(
            total=models.Sum("monto")
        )["total"] or Decimal("0")

        gastos = self.movimientos.filter(tipo="GASTO").aggregate(
            total=models.Sum("monto")
        )["total"] or Decimal("0")

        transferencias_salida = self.transferencias_salida.aggregate(
            total=models.Sum("monto")
        )["total"] or Decimal("0")

        transferencias_entrada = self.transferencias_entrada.aggregate(
            total=models.Sum("monto")
        )["total"] or Decimal("0")

        return (
            self.saldo_inicial
            + ingresos
            - gastos
            - transferencias_salida
            + transferencias_entrada
        )


class TarjetaCredito(models.Model):
    TIPO_CHOICES = [
        ("CREDITO", "Crédito"),
        ("DEBITO", "Débito"),
    ]
    ENTIDAD_CHOICES = [
        ("OH", "Financiera OH!"),
        ("CMR", "CMR Falabella"),
        ("BCP", "BCP"),
        ("INTERBANK", "Interbank"),
        ("BBVA", "BBVA"),
        ("SCOTIABANK", "Scotiabank"),
        ("OTRA", "Otra entidad"),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tarjetas_credito",
    )
    tipo = models.CharField(
        max_length=10,
        choices=TIPO_CHOICES,
        default="CREDITO",
    )
    nombre = models.CharField(
        max_length=100,
        help_text="Ejemplo: Tarjeta CMR principal",
    )
    entidad = models.CharField(
        max_length=20,
        choices=ENTIDAD_CHOICES,
    )
    linea_credito = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
        null=True,
        blank=True,
    )
    saldo_inicial_usado = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
    )
    dia_cierre = models.PositiveSmallIntegerField(
        validators=[
            MinValueValidator(1),
            MaxValueValidator(31),
        ],
        null=True,
        blank=True,
    )
    dia_pago = models.PositiveSmallIntegerField(
        validators=[
            MinValueValidator(1),
            MaxValueValidator(31),
        ],
        null=True,
        blank=True,
    )
    tasa_interes_anual = models.DecimalField(
        max_digits=7,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
    )
    moneda = models.CharField(max_length=3, default="PEN")
    activa = models.BooleanField(default=True)
    cuenta_vinculada = models.ForeignKey(
        Cuenta,
        on_delete=models.PROTECT,
        related_name="tarjetas_debito",
        null=True,
        blank=True,
        help_text="Cuenta cuyo saldo se descuenta al usar una tarjeta de débito.",
    )
    creada = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["entidad", "nombre"]

    def __str__(self):
        return f"{self.nombre} · {self.get_entidad_display()} ({self.get_tipo_display()})"

    def clean(self):
        errores = {}
        if self.tipo == "DEBITO":
            if not self.cuenta_vinculada:
                errores["cuenta_vinculada"] = (
                    "Selecciona la cuenta bancaria vinculada a esta tarjeta."
                )
        else:
            if not self.linea_credito:
                errores["linea_credito"] = "Indica la línea de crédito."
            if not self.dia_cierre:
                errores["dia_cierre"] = "Indica el día de cierre."
            if not self.dia_pago:
                errores["dia_pago"] = "Indica el día de pago."
        if errores:
            raise ValidationError(errores)

    @property
    def saldo_utilizado(self):
        if self.tipo != "CREDITO":
            return Decimal("0")
        compras = self.movimientos.filter(
            tipo="GASTO",
            medio_pago="TARJETA_CREDITO",
        ).aggregate(total=models.Sum("monto"))["total"] or Decimal("0")

        pagos = self.pagos.aggregate(
            total=models.Sum("monto")
        )["total"] or Decimal("0")

        return max(
            Decimal("0"),
            self.saldo_inicial_usado + compras - pagos,
        )

    @property
    def credito_disponible(self):
        if self.tipo != "CREDITO" or self.linea_credito is None:
            return Decimal("0")
        return max(
            Decimal("0"),
            self.linea_credito - self.saldo_utilizado,
        )

    @property
    def porcentaje_utilizado(self):
        if not self.linea_credito or self.linea_credito <= 0:
            return 0

        porcentaje = (
            self.saldo_utilizado / self.linea_credito
        ) * Decimal("100")

        return min(Decimal("100"), porcentaje)


class Movimiento(models.Model):
    TIPO_CHOICES = [
        ("INGRESO", "Ingreso"),
        ("GASTO", "Gasto"),
    ]

    MEDIO_PAGO_CHOICES = [
        ("EFECTIVO", "Efectivo"),
        ("CUENTA_BANCARIA", "Cuenta bancaria"),
        ("YAPE", "Yape"),
        ("PLIN", "Plin"),
        ("TARJETA_DEBITO", "Tarjeta de débito"),
        ("TARJETA_CREDITO", "Tarjeta de crédito"),
        ("OTRO", "Otro"),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="movimientos_financieros",
    )
    persona = models.ForeignKey(
        Persona,
        on_delete=models.SET_NULL,
        related_name="movimientos",
        null=True,
        blank=True,
        help_text="Persona a quien corresponde este ingreso o egreso.",
    )
    tipo = models.CharField(
        max_length=10,
        choices=TIPO_CHOICES,
    )
    cuenta = models.ForeignKey(
        Cuenta,
        on_delete=models.PROTECT,
        related_name="movimientos",
        null=True,
        blank=True,
    )
    categoria = models.ForeignKey(
        Categoria,
        on_delete=models.PROTECT,
        related_name="movimientos",
    )
    tarjeta_credito = models.ForeignKey(
        TarjetaCredito,
        on_delete=models.PROTECT,
        related_name="movimientos",
        null=True,
        blank=True,
    )
    medio_pago = models.CharField(
        max_length=25,
        choices=MEDIO_PAGO_CHOICES,
        default="EFECTIVO",
    )
    monto = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    numero_cuotas = models.PositiveSmallIntegerField(
        default=1,
        validators=[
            MinValueValidator(1),
            MaxValueValidator(48),
        ],
    )
    fecha = models.DateField()
    descripcion = models.CharField(
        max_length=200,
        blank=True,
    )
    notas = models.TextField(blank=True)
    comprobante = models.FileField(
        upload_to="comprobantes/%Y/%m/",
        null=True,
        blank=True,
    )
    creado = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-fecha", "-creado"]

    def __str__(self):
        return f"{self.get_tipo_display()} - S/ {self.monto}"

    def clean(self):
        errores = {}

        if self.categoria_id and self.tipo != self.categoria.tipo:
            errores["categoria"] = (
                "La categoría seleccionada no corresponde "
                "al tipo de movimiento."
            )

        if self.medio_pago in ("TARJETA_CREDITO", "TARJETA_DEBITO"):
            if self.medio_pago == "TARJETA_CREDITO":
                self.cuenta = None
            elif self.tarjeta_credito and self.tarjeta_credito.cuenta_vinculada:
                self.cuenta = self.tarjeta_credito.cuenta_vinculada

            if self.tipo != "GASTO":
                errores["medio_pago"] = (
                    "Las tarjetas solo pueden usarse para registrar gastos."
                )

            if not self.tarjeta_credito:
                errores["tarjeta_credito"] = "Debes seleccionar la tarjeta utilizada."

            tipo_esperado = (
                "CREDITO" if self.medio_pago == "TARJETA_CREDITO" else "DEBITO"
            )
            if self.tarjeta_credito and self.tarjeta_credito.tipo != tipo_esperado:
                errores["tarjeta_credito"] = (
                    f"Selecciona una tarjeta de {tipo_esperado.lower()}."
                )

            if self.medio_pago == "TARJETA_DEBITO" and self.tarjeta_credito:
                if not self.tarjeta_credito.cuenta_vinculada:
                    errores["tarjeta_credito"] = (
                        "Esta tarjeta de débito no tiene una cuenta vinculada."
                    )
                elif self.cuenta_id != self.tarjeta_credito.cuenta_vinculada_id:
                    errores["cuenta"] = (
                        "La cuenta debe ser la vinculada a la tarjeta de débito."
                    )
        elif self.tarjeta_credito:
            errores["tarjeta_credito"] = (
                "Solo debes seleccionar una tarjeta cuando el medio de pago sea una tarjeta."
            )

        if self.medio_pago not in ("TARJETA_CREDITO", "TARJETA_DEBITO") and not self.cuenta:
            errores["cuenta"] = (
                "Debes seleccionar la cuenta desde la que "
                "se realizó el movimiento."
            )

        if self.numero_cuotas > 1 and self.medio_pago != "TARJETA_CREDITO":
            errores["numero_cuotas"] = (
                "Las cuotas solo están disponibles para "
                "compras con tarjeta de crédito."
            )

        if errores:
            raise ValidationError(errores)

    @property
    def monto_por_cuota(self):
        if self.numero_cuotas <= 0:
            return self.monto
        return self.monto / self.numero_cuotas


class PagoTarjeta(models.Model):
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pagos_tarjetas",
    )
    tarjeta = models.ForeignKey(
        TarjetaCredito,
        on_delete=models.PROTECT,
        related_name="pagos",
    )
    cuenta = models.ForeignKey(
        Cuenta,
        on_delete=models.PROTECT,
        related_name="pagos_tarjeta",
    )
    monto = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    fecha = models.DateField()
    descripcion = models.CharField(
        max_length=200,
        blank=True,
    )
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fecha", "-creado"]

    def __str__(self):
        return f"Pago de {self.tarjeta} - S/ {self.monto}"


class Transferencia(models.Model):
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="transferencias",
    )
    cuenta_origen = models.ForeignKey(
        Cuenta,
        on_delete=models.PROTECT,
        related_name="transferencias_salida",
    )
    cuenta_destino = models.ForeignKey(
        Cuenta,
        on_delete=models.PROTECT,
        related_name="transferencias_entrada",
    )
    monto = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    fecha = models.DateField()
    descripcion = models.CharField(
        max_length=200,
        blank=True,
    )
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fecha", "-creado"]

    def __str__(self):
        return f"{self.cuenta_origen} → {self.cuenta_destino}"

    def clean(self):
        if (
            self.cuenta_origen_id
            and self.cuenta_destino_id
            and self.cuenta_origen_id == self.cuenta_destino_id
        ):
            raise ValidationError(
                "La cuenta de origen y la cuenta de destino "
                "deben ser diferentes."
            )


class GastoRecurrente(models.Model):
    FRECUENCIA_CHOICES = [
        ("MENSUAL", "Mensual"),
        ("QUINCENAL", "Quincenal"),
        ("SEMANAL", "Semanal"),
        ("ANUAL", "Anual"),
    ]

    SERVICIO_CHOICES = [
        ("LUZ", "Luz"),
        ("AGUA", "Agua"),
        ("INTERNET", "Internet"),
        ("ALQUILER", "Alquiler"),
        ("GAS", "Gas"),
        ("TELEFONO", "Teléfono"),
        ("SEGURO", "Seguro"),
        ("OTRO", "Otro"),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="gastos_recurrentes",
    )
    nombre = models.CharField(max_length=120)
    servicio = models.CharField(
        max_length=20,
        choices=SERVICIO_CHOICES,
    )
    categoria = models.ForeignKey(
        Categoria,
        on_delete=models.PROTECT,
        related_name="gastos_recurrentes",
        limit_choices_to={"tipo": "GASTO"},
    )
    cuenta = models.ForeignKey(
        Cuenta,
        on_delete=models.PROTECT,
        related_name="gastos_recurrentes",
        null=True,
        blank=True,
    )
    tarjeta_credito = models.ForeignKey(
        TarjetaCredito,
        on_delete=models.PROTECT,
        related_name="gastos_recurrentes",
        null=True,
        blank=True,
    )
    medio_pago = models.CharField(
        max_length=25,
        choices=Movimiento.MEDIO_PAGO_CHOICES,
        default="EFECTIVO",
    )
    monto_estimado = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    frecuencia = models.CharField(
        max_length=15,
        choices=FRECUENCIA_CHOICES,
        default="MENSUAL",
    )
    proxima_fecha = models.DateField()
    activo = models.BooleanField(default=True)
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["proxima_fecha", "nombre"]

    def __str__(self):
        return self.nombre

    def clean(self):
        errores = {}

        if self.categoria_id and self.categoria.tipo != "GASTO":
            errores["categoria"] = (
                "El gasto recurrente debe usar una categoría de gasto."
            )

        if self.medio_pago in ("TARJETA_CREDITO", "TARJETA_DEBITO"):
            if self.medio_pago == "TARJETA_CREDITO":
                self.cuenta = None
            elif self.tarjeta_credito and self.tarjeta_credito.cuenta_vinculada:
                self.cuenta = self.tarjeta_credito.cuenta_vinculada

            if not self.tarjeta_credito:
                errores["tarjeta_credito"] = (
                    "Debes seleccionar la tarjeta utilizada."
                )

            tipo_esperado = (
                "CREDITO" if self.medio_pago == "TARJETA_CREDITO" else "DEBITO"
            )
            if self.tarjeta_credito and self.tarjeta_credito.tipo != tipo_esperado:
                errores["tarjeta_credito"] = (
                    f"Selecciona una tarjeta de {tipo_esperado.lower()}."
                )
        else:
            if not self.cuenta:
                errores["cuenta"] = (
                    "Debes seleccionar la cuenta desde donde se pagará."
                )
            if self.tarjeta_credito:
                errores["tarjeta_credito"] = (
                    "No selecciones una tarjeta para este medio de pago."
                )

        if errores:
            raise ValidationError(errores)


class Presupuesto(models.Model):
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="presupuestos",
    )
    categoria = models.ForeignKey(
        Categoria,
        on_delete=models.CASCADE,
        related_name="presupuestos",
        limit_choices_to={"tipo": "GASTO"},
    )
    mes = models.DateField(
        help_text="Usa el primer día del mes."
    )
    limite = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )

    class Meta:
        ordering = ["-mes", "categoria__nombre"]
        constraints = [
            models.UniqueConstraint(
                fields=["usuario", "categoria", "mes"],
                name="presupuesto_unico_por_mes",
            )
        ]

    def __str__(self):
        return f"{self.categoria.nombre} - {self.mes:%m/%Y}"

    @property
    def gastado(self):
        return Movimiento.objects.filter(
            usuario=self.usuario,
            tipo="GASTO",
            categoria=self.categoria,
            fecha__year=self.mes.year,
            fecha__month=self.mes.month,
        ).aggregate(total=models.Sum("monto"))["total"] or Decimal("0")

    @property
    def disponible(self):
        return self.limite - self.gastado

    @property
    def porcentaje_utilizado(self):
        if self.limite <= 0:
            return 0

        porcentaje = (
            self.gastado / self.limite
        ) * Decimal("100")

        return min(Decimal("100"), porcentaje)


class MetaAhorro(models.Model):
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="metas_ahorro",
    )
    nombre = models.CharField(max_length=120)
    monto_objetivo = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    monto_actual = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
    )
    fecha_objetivo = models.DateField(
        null=True,
        blank=True,
    )
    completada = models.BooleanField(default=False)

    class Meta:
        ordering = ["completada", "fecha_objetivo", "nombre"]

    @property
    def porcentaje(self):
        if self.monto_objetivo <= 0:
            return 0

        porcentaje = (
            self.monto_actual / self.monto_objetivo
        ) * Decimal("100")

        return min(Decimal("100"), round(porcentaje, 1))

    def __str__(self):
        return self.nombre


class Deuda(models.Model):
    ESTADO_CHOICES = [
        ("PENDIENTE", "Pendiente"),
        ("PAGADA", "Pagada"),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="deudas",
    )
    acreedor = models.CharField(max_length=120)
    descripcion = models.CharField(
        max_length=200,
        blank=True,
    )
    monto_total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    monto_pagado = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
    )
    fecha_vencimiento = models.DateField(
        null=True,
        blank=True,
    )
    estado = models.CharField(
        max_length=10,
        choices=ESTADO_CHOICES,
        default="PENDIENTE",
    )

    class Meta:
        ordering = ["estado", "fecha_vencimiento", "acreedor"]

    @property
    def saldo_pendiente(self):
        return max(
            Decimal("0"),
            self.monto_total - self.monto_pagado,
        )

    def __str__(self):
        return self.acreedor
