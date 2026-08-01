from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.db.models import Q, Sum
from django.db.models.functions import TruncMonth
from django.shortcuts import get_object_or_404, redirect, render

from .forms import (
    CategoriaForm,
    CuentaForm,
    DeudaForm,
    GastoRecurrenteForm,
    MetaAhorroForm,
    MovimientoForm,
    PagoTarjetaForm,
    PersonaForm,
    PresupuestoForm,
    RegistroForm,
    TarjetaCreditoForm,
    TransferenciaForm,
)
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


def inicio(request):
    if request.user.is_authenticated:
        return redirect("dashboard")

    return redirect("login")


def registro(request):
    if request.user.is_authenticated:
        return redirect("dashboard")

    if request.method == "POST":
        form = RegistroForm(request.POST)
        if form.is_valid():
            usuario = form.save()
            login(request, usuario)
            messages.success(request, "Tu cuenta fue creada correctamente. ¡Bienvenido!")
            return redirect("dashboard")
    else:
        form = RegistroForm()

    return render(request, "registration/registro.html", {"form": form})


@login_required
def dashboard(request):
    hoy = date.today()

    movimientos_mes = Movimiento.objects.filter(
        usuario=request.user,
        fecha__year=hoy.year,
        fecha__month=hoy.month,
    )

    ingresos_mes = movimientos_mes.filter(
        tipo="INGRESO"
    ).aggregate(
        total=Sum("monto")
    )["total"] or Decimal("0")

    gastos_mes = movimientos_mes.filter(
        tipo="GASTO"
    ).aggregate(
        total=Sum("monto")
    )["total"] or Decimal("0")

    primer_dia = hoy.replace(day=1)
    ultimo_mes = primer_dia - timedelta(days=1)
    movimientos_anterior = Movimiento.objects.filter(
        usuario=request.user,
        fecha__year=ultimo_mes.year,
        fecha__month=ultimo_mes.month,
    )
    gastos_anterior = movimientos_anterior.filter(tipo="GASTO").aggregate(
        total=Sum("monto")
    )["total"] or Decimal("0")
    ahorro_mes = ingresos_mes - gastos_mes
    tasa_ahorro = round((ahorro_mes / ingresos_mes) * 100, 1) if ingresos_mes else 0
    variacion_gastos = round(
        ((gastos_mes - gastos_anterior) / gastos_anterior) * 100, 1
    ) if gastos_anterior else 0

    cuentas = Cuenta.objects.filter(
        usuario=request.user,
        activa=True,
    )

    saldo_total = sum(
        (cuenta.saldo_actual for cuenta in cuentas),
        Decimal("0"),
    )

    tarjetas = TarjetaCredito.objects.filter(
        usuario=request.user,
        activa=True,
    )

    deuda_tarjetas = sum(
        (tarjeta.saldo_utilizado for tarjeta in tarjetas),
        Decimal("0"),
    )

    gastos_categoria = list(
        movimientos_mes.filter(
            tipo="GASTO"
        )
        .values("categoria__nombre")
        .annotate(total=Sum("monto"))
        .order_by("-total")[:6]
    )

    gastos_recurrentes = GastoRecurrente.objects.filter(
        usuario=request.user,
        activo=True,
    ).order_by("proxima_fecha")[:5]

    personas = Persona.objects.filter(usuario=request.user, activa=True)
    resumen_personas = []
    for persona in personas:
        propios = movimientos_mes.filter(persona=persona)
        ingresos = propios.filter(tipo="INGRESO").aggregate(total=Sum("monto"))["total"] or Decimal("0")
        gastos = propios.filter(tipo="GASTO").aggregate(total=Sum("monto"))["total"] or Decimal("0")
        resumen_personas.append({
            "persona": persona,
            "ingresos": ingresos,
            "gastos": gastos,
            "balance": ingresos - gastos,
        })

    contexto = {
        "saldo_total": saldo_total,
        "patrimonio_neto": saldo_total - deuda_tarjetas,
        "ingresos_mes": ingresos_mes,
        "gastos_mes": gastos_mes,
        "balance_mes": ingresos_mes - gastos_mes,
        "tasa_ahorro": tasa_ahorro,
        "variacion_gastos": variacion_gastos,
        "deuda_tarjetas": deuda_tarjetas,
        "ultimos_movimientos": Movimiento.objects.filter(
            usuario=request.user
        ).select_related(
            "cuenta",
            "categoria",
            "tarjeta_credito",
        )[:8],
        "cuentas": cuentas,
        "tarjetas": tarjetas,
        "gastos_categoria": gastos_categoria,
        "gastos_recurrentes": gastos_recurrentes,
        "resumen_personas": resumen_personas,
        "metas": MetaAhorro.objects.filter(
            usuario=request.user
        )[:4],
        "deudas_pendientes": Deuda.objects.filter(
            usuario=request.user,
            estado="PENDIENTE",
        )[:4],
    }

    return render(
        request,
        "finanzas/dashboard.html",
        contexto,
    )


# =========================================================
# CUENTAS
# =========================================================

@login_required
def cuentas_lista(request):
    objetos = Cuenta.objects.filter(
        usuario=request.user
    )

    return render(
        request,
        "finanzas/lista_generica.html",
        {
            "titulo": "Cuentas",
            "objetos": objetos,
            "tipo_lista": "cuentas",
            "crear_url": "cuenta_crear",
        },
    )


@login_required
def cuenta_crear(request):
    return formulario_simple(
        request=request,
        form_class=CuentaForm,
        titulo="Nueva cuenta",
        redireccion="cuentas_lista",
    )


@login_required
def cuenta_editar(request, pk):
    cuenta = get_object_or_404(
        Cuenta,
        pk=pk,
        usuario=request.user,
    )

    return formulario_simple(
        request=request,
        form_class=CuentaForm,
        titulo="Editar cuenta",
        redireccion="cuentas_lista",
        instance=cuenta,
    )


# =========================================================
# CATEGORÍAS
# =========================================================

@login_required
def categorias_lista(request):
    objetos = Categoria.objects.filter(
        usuario=request.user
    )

    return render(
        request,
        "finanzas/lista_generica.html",
        {
            "titulo": "Categorías",
            "objetos": objetos,
            "tipo_lista": "categorias",
            "crear_url": "categoria_crear",
        },
    )


@login_required
def categoria_crear(request):
    return formulario_simple(
        request=request,
        form_class=CategoriaForm,
        titulo="Nueva categoría",
        redireccion="categorias_lista",
    )


@login_required
def categoria_editar(request, pk):
    categoria = get_object_or_404(
        Categoria,
        pk=pk,
        usuario=request.user,
    )

    return formulario_simple(
        request=request,
        form_class=CategoriaForm,
        titulo="Editar categoría",
        redireccion="categorias_lista",
        instance=categoria,
    )


# =========================================================
# TARJETAS DE CRÉDITO
# =========================================================

@login_required
def tarjetas_lista(request):
    objetos = TarjetaCredito.objects.filter(
        usuario=request.user
    )

    return render(
        request,
        "finanzas/lista_generica.html",
        {
            "titulo": "Tarjetas de crédito",
            "objetos": objetos,
            "tipo_lista": "tarjetas",
            "crear_url": "tarjeta_crear",
        },
    )


@login_required
def tarjeta_crear(request):
    return formulario_simple(
        request=request,
        form_class=TarjetaCreditoForm,
        titulo="Nueva tarjeta de crédito",
        redireccion="tarjetas_lista",
    )


@login_required
def tarjeta_editar(request, pk):
    tarjeta = get_object_or_404(
        TarjetaCredito,
        pk=pk,
        usuario=request.user,
    )

    return formulario_simple(
        request=request,
        form_class=TarjetaCreditoForm,
        titulo="Editar tarjeta de crédito",
        redireccion="tarjetas_lista",
        instance=tarjeta,
    )


# =========================================================
# MOVIMIENTOS
# =========================================================

@login_required
def movimientos_lista(request):
    movimientos = Movimiento.objects.filter(
        usuario=request.user
    ).select_related(
        "cuenta",
        "categoria",
        "tarjeta_credito",
    )

    tipo = request.GET.get("tipo")
    categoria = request.GET.get("categoria")
    cuenta = request.GET.get("cuenta")
    persona = request.GET.get("persona")

    if tipo in {"INGRESO", "GASTO"}:
        movimientos = movimientos.filter(
            tipo=tipo
        )

    if categoria:
        movimientos = movimientos.filter(
            categoria_id=categoria
        )

    if cuenta:
        movimientos = movimientos.filter(
            cuenta_id=cuenta
        )

    if persona:
        movimientos = movimientos.filter(persona_id=persona)

    contexto = {
        "titulo": "Movimientos",
        "objetos": movimientos,
        "tipo_lista": "movimientos",
        "crear_url": "movimiento_crear",
        "categorias_filtro": Categoria.objects.filter(
            usuario=request.user,
            activa=True,
        ),
        "cuentas_filtro": Cuenta.objects.filter(
            usuario=request.user,
            activa=True,
        ),
        "personas_filtro": Persona.objects.filter(
            usuario=request.user,
            activa=True,
        ),
    }

    return render(
        request,
        "finanzas/lista_generica.html",
        contexto,
    )


@login_required
def movimiento_crear(request):
    return formulario_simple(
        request=request,
        form_class=MovimientoForm,
        titulo="Nuevo movimiento",
        redireccion="movimientos_lista",
        usar_usuario=True,
        usar_archivos=True,
        initial={
            key: request.GET.get(key)
            for key in ("persona", "tipo")
            if request.GET.get(key)
        },
    )


@login_required
def movimiento_editar(request, pk):
    movimiento = get_object_or_404(
        Movimiento,
        pk=pk,
        usuario=request.user,
    )

    return formulario_simple(
        request=request,
        form_class=MovimientoForm,
        titulo="Editar movimiento",
        redireccion="movimientos_lista",
        instance=movimiento,
        usar_usuario=True,
        usar_archivos=True,
    )


@login_required
def movimiento_eliminar(request, pk):
    movimiento = get_object_or_404(
        Movimiento,
        pk=pk,
        usuario=request.user,
    )

    if request.method == "POST":
        movimiento.delete()

        messages.success(
            request,
            "Movimiento eliminado correctamente.",
        )

        return redirect("movimientos_lista")

    return render(
        request,
        "finanzas/confirmar_eliminar.html",
        {
            "objeto": movimiento,
            "volver": "movimientos_lista",
        },
    )


# =========================================================
# TRANSFERENCIAS
# =========================================================

@login_required
def transferencias_lista(request):
    objetos = Transferencia.objects.filter(
        usuario=request.user
    ).select_related(
        "cuenta_origen",
        "cuenta_destino",
    )

    return render(
        request,
        "finanzas/lista_generica.html",
        {
            "titulo": "Transferencias",
            "objetos": objetos,
            "tipo_lista": "transferencias",
            "crear_url": "transferencia_crear",
        },
    )


@login_required
def transferencia_crear(request):
    return formulario_simple(
        request=request,
        form_class=TransferenciaForm,
        titulo="Nueva transferencia",
        redireccion="transferencias_lista",
        usar_usuario=True,
    )


# =========================================================
# PAGOS DE TARJETAS
# =========================================================

@login_required
def pagos_tarjetas_lista(request):
    objetos = PagoTarjeta.objects.filter(
        usuario=request.user
    ).select_related(
        "tarjeta",
        "cuenta",
    )

    return render(
        request,
        "finanzas/lista_generica.html",
        {
            "titulo": "Pagos de tarjetas",
            "objetos": objetos,
            "tipo_lista": "pagos_tarjetas",
            "crear_url": "pago_tarjeta_crear",
        },
    )


@login_required
def pago_tarjeta_crear(request):
    return formulario_simple(
        request=request,
        form_class=PagoTarjetaForm,
        titulo="Registrar pago de tarjeta",
        redireccion="pagos_tarjetas_lista",
        usar_usuario=True,
    )


# =========================================================
# GASTOS RECURRENTES
# =========================================================

@login_required
def gastos_recurrentes_lista(request):
    objetos = GastoRecurrente.objects.filter(
        usuario=request.user
    ).select_related(
        "categoria",
        "cuenta",
        "tarjeta_credito",
    )

    return render(
        request,
        "finanzas/lista_generica.html",
        {
            "titulo": "Gastos recurrentes",
            "objetos": objetos,
            "tipo_lista": "gastos_recurrentes",
            "crear_url": "gasto_recurrente_crear",
        },
    )


@login_required
def gasto_recurrente_crear(request):
    return formulario_simple(
        request=request,
        form_class=GastoRecurrenteForm,
        titulo="Nuevo gasto recurrente",
        redireccion="gastos_recurrentes_lista",
        usar_usuario=True,
    )


@login_required
def gasto_recurrente_editar(request, pk):
    gasto = get_object_or_404(
        GastoRecurrente,
        pk=pk,
        usuario=request.user,
    )

    return formulario_simple(
        request=request,
        form_class=GastoRecurrenteForm,
        titulo="Editar gasto recurrente",
        redireccion="gastos_recurrentes_lista",
        instance=gasto,
        usar_usuario=True,
    )


# =========================================================
# PRESUPUESTOS
# =========================================================

@login_required
def presupuestos_lista(request):
    objetos = Presupuesto.objects.filter(
        usuario=request.user
    ).select_related(
        "categoria"
    )

    return render(
        request,
        "finanzas/lista_generica.html",
        {
            "titulo": "Presupuestos",
            "objetos": objetos,
            "tipo_lista": "presupuestos",
            "crear_url": "presupuesto_crear",
        },
    )


@login_required
def presupuesto_crear(request):
    return formulario_simple(
        request=request,
        form_class=PresupuestoForm,
        titulo="Nuevo presupuesto",
        redireccion="presupuestos_lista",
        usar_usuario=True,
    )


# =========================================================
# METAS
# =========================================================

@login_required
def metas_lista(request):
    objetos = MetaAhorro.objects.filter(
        usuario=request.user
    )

    return render(
        request,
        "finanzas/lista_generica.html",
        {
            "titulo": "Metas de ahorro",
            "objetos": objetos,
            "tipo_lista": "metas",
            "crear_url": "meta_crear",
        },
    )


@login_required
def meta_crear(request):
    return formulario_simple(
        request=request,
        form_class=MetaAhorroForm,
        titulo="Nueva meta de ahorro",
        redireccion="metas_lista",
    )


@login_required
def meta_editar(request, pk):
    meta = get_object_or_404(
        MetaAhorro,
        pk=pk,
        usuario=request.user,
    )

    return formulario_simple(
        request=request,
        form_class=MetaAhorroForm,
        titulo="Editar meta",
        redireccion="metas_lista",
        instance=meta,
    )


# =========================================================
# DEUDAS
# =========================================================

@login_required
def deudas_lista(request):
    objetos = Deuda.objects.filter(
        usuario=request.user
    )

    return render(
        request,
        "finanzas/lista_generica.html",
        {
            "titulo": "Deudas",
            "objetos": objetos,
            "tipo_lista": "deudas",
            "crear_url": "deuda_crear",
        },
    )


@login_required
def deuda_crear(request):
    return formulario_simple(
        request=request,
        form_class=DeudaForm,
        titulo="Nueva deuda",
        redireccion="deudas_lista",
    )


@login_required
def deuda_editar(request, pk):
    deuda = get_object_or_404(
        Deuda,
        pk=pk,
        usuario=request.user,
    )

    return formulario_simple(
        request=request,
        form_class=DeudaForm,
        titulo="Editar deuda",
        redireccion="deudas_lista",
        instance=deuda,
    )


# =========================================================
# REPORTES
# =========================================================

@login_required
def flujo_mensual(request):
    hoy = date.today()
    mes_solicitado = request.GET.get("mes", "")
    try:
        mes_actual = date.fromisoformat(f"{mes_solicitado}-01") if mes_solicitado else hoy.replace(day=1)
    except ValueError:
        mes_actual = hoy.replace(day=1)

    movimientos = Movimiento.objects.filter(
        usuario=request.user,
        fecha__year=mes_actual.year,
        fecha__month=mes_actual.month,
    ).select_related("persona", "categoria", "cuenta", "tarjeta_credito")

    ingresos = movimientos.filter(tipo="INGRESO").aggregate(total=Sum("monto"))["total"] or Decimal("0")
    egresos = movimientos.filter(tipo="GASTO").aggregate(total=Sum("monto"))["total"] or Decimal("0")
    balance = ingresos - egresos
    tasa_ahorro = round((balance / ingresos) * 100, 1) if ingresos else 0

    totales_diarios = {
        (fila["fecha"], fila["tipo"]): fila["total"]
        for fila in movimientos.values("fecha", "tipo").annotate(total=Sum("monto"))
    }
    dias_mes = monthrange(mes_actual.year, mes_actual.month)[1]
    dias = []
    maximo_dia = Decimal("0")
    for numero in range(1, dias_mes + 1):
        fecha_dia = mes_actual.replace(day=numero)
        ingreso_dia = totales_diarios.get((fecha_dia, "INGRESO"), Decimal("0"))
        egreso_dia = totales_diarios.get((fecha_dia, "GASTO"), Decimal("0"))
        maximo_dia = max(maximo_dia, ingreso_dia, egreso_dia)
        dias.append({"fecha": fecha_dia, "ingresos": ingreso_dia, "egresos": egreso_dia})
    for dia in dias:
        dia["ingreso_pct"] = round((dia["ingresos"] / maximo_dia) * 100) if maximo_dia else 0
        dia["egreso_pct"] = round((dia["egresos"] / maximo_dia) * 100) if maximo_dia else 0

    personas = []
    personas_ids = movimientos.exclude(persona__isnull=True).values_list("persona_id", flat=True).distinct()
    for persona in Persona.objects.filter(pk__in=personas_ids):
        propios = movimientos.filter(persona=persona)
        entrada = propios.filter(tipo="INGRESO").aggregate(total=Sum("monto"))["total"] or Decimal("0")
        salida = propios.filter(tipo="GASTO").aggregate(total=Sum("monto"))["total"] or Decimal("0")
        personas.append({"persona": persona, "ingresos": entrada, "egresos": salida, "balance": entrada - salida})

    categorias = list(
        movimientos.filter(tipo="GASTO")
        .values("categoria__nombre", "categoria__color")
        .annotate(total=Sum("monto"))
        .order_by("-total")[:8]
    )
    for categoria in categorias:
        categoria["porcentaje"] = round((categoria["total"] / egresos) * 100) if egresos else 0

    mes_anterior = (mes_actual - timedelta(days=1)).replace(day=1)
    if mes_actual.month == 12:
        mes_siguiente = date(mes_actual.year + 1, 1, 1)
    else:
        mes_siguiente = date(mes_actual.year, mes_actual.month + 1, 1)

    return render(request, "finanzas/flujo_mensual.html", {
        "mes_actual": mes_actual,
        "mes_anterior": mes_anterior,
        "mes_siguiente": mes_siguiente,
        "ingresos": ingresos,
        "egresos": egresos,
        "balance": balance,
        "tasa_ahorro": tasa_ahorro,
        "promedio_egreso": egresos / dias_mes if dias_mes else Decimal("0"),
        "dias": dias,
        "personas": personas,
        "categorias": categorias,
        "movimientos": movimientos,
    })

@login_required
def reportes(request):
    movimientos = (
        Movimiento.objects.filter(
            usuario=request.user
        )
        .annotate(
            mes=TruncMonth("fecha")
        )
        .values(
            "mes",
            "tipo",
        )
        .annotate(
            total=Sum("monto")
        )
        .order_by("mes")
    )

    meses = {}

    for fila in movimientos:
        clave = fila["mes"].strftime("%Y-%m")

        meses.setdefault(
            clave,
            {
                "ingresos": Decimal("0"),
                "gastos": Decimal("0"),
            },
        )

        if fila["tipo"] == "INGRESO":
            meses[clave]["ingresos"] = fila["total"]
        else:
            meses[clave]["gastos"] = fila["total"]

    filas = []

    for mes, valores in sorted(
        meses.items(),
        reverse=True,
    ):
        filas.append(
            {
                "mes": mes,
                "ingresos": valores["ingresos"],
                "gastos": valores["gastos"],
                "balance": (
                    valores["ingresos"]
                    - valores["gastos"]
                ),
            }
        )

    gastos_por_categoria = list(
        Movimiento.objects.filter(
            usuario=request.user,
            tipo="GASTO",
        )
        .values("categoria__nombre")
        .annotate(total=Sum("monto"))
        .order_by("-total")
    )

    mayor_categoria = gastos_por_categoria[0]["total"] if gastos_por_categoria else Decimal("0")
    for categoria in gastos_por_categoria:
        categoria["porcentaje"] = round(
            (categoria["total"] / mayor_categoria) * 100
        ) if mayor_categoria else 0

    total_ingresos = sum((fila["ingresos"] for fila in filas), Decimal("0"))
    total_gastos = sum((fila["gastos"] for fila in filas), Decimal("0"))

    return render(
        request,
        "finanzas/reportes.html",
        {
            "filas": filas,
            "gastos_por_categoria": gastos_por_categoria,
            "total_ingresos": total_ingresos,
            "total_gastos": total_gastos,
            "balance_total": total_ingresos - total_gastos,
        },
    )


# =========================================================
# FUNCIÓN REUTILIZABLE PARA FORMULARIOS
# =========================================================

def formulario_simple(
    request,
    form_class,
    titulo,
    redireccion,
    instance=None,
    usar_usuario=False,
    usar_archivos=False,
    initial=None,
):
    argumentos = {
        "instance": instance,
    }

    if initial and instance is None:
        argumentos["initial"] = initial

    if usar_usuario:
        argumentos["usuario"] = request.user

    if request.method == "POST":
        if usar_archivos:
            form = form_class(
                request.POST,
                request.FILES,
                **argumentos,
            )
        else:
            form = form_class(
                request.POST,
                **argumentos,
            )

        if form.is_valid():
            objeto = form.save(
                commit=False
            )

            if hasattr(
                objeto,
                "usuario_id",
            ):
                objeto.usuario = request.user

            objeto.full_clean()
            objeto.save()

            messages.success(
                request,
                "Información guardada correctamente.",
            )

            return redirect(redireccion)

    else:
        form = form_class(
            **argumentos
        )

    return render(
        request,
        "finanzas/formulario.html",
        {
            "form": form,
            "titulo": titulo,
            "volver": redireccion,
        },
    )


# =========================================================
# PERSONAS
# =========================================================

@login_required
def personas_lista(request):
    personas = Persona.objects.filter(usuario=request.user)
    hoy = date.today()
    resumen = []
    for persona in personas:
        movimientos = persona.movimientos.filter(
            fecha__year=hoy.year,
            fecha__month=hoy.month,
        )
        ingresos = movimientos.filter(tipo="INGRESO").aggregate(total=Sum("monto"))["total"] or Decimal("0")
        gastos = movimientos.filter(tipo="GASTO").aggregate(total=Sum("monto"))["total"] or Decimal("0")
        resumen.append({
            "persona": persona,
            "ingresos": ingresos,
            "gastos": gastos,
            "balance": ingresos - gastos,
            "movimientos": movimientos.count(),
        })
    return render(request, "finanzas/personas.html", {"resumen": resumen})


@login_required
def persona_crear(request):
    return formulario_simple(
        request=request,
        form_class=PersonaForm,
        titulo="Nueva persona",
        redireccion="personas_lista",
    )


@login_required
def persona_editar(request, pk):
    persona = get_object_or_404(Persona, pk=pk, usuario=request.user)
    return formulario_simple(
        request=request,
        form_class=PersonaForm,
        titulo="Editar persona",
        redireccion="personas_lista",
        instance=persona,
    )


@login_required
def persona_detalle(request, pk):
    persona = get_object_or_404(Persona, pk=pk, usuario=request.user)
    movimientos = persona.movimientos.select_related("categoria", "cuenta", "tarjeta_credito")
    desde = request.GET.get("desde", "")
    hasta = request.GET.get("hasta", "")
    tipo = request.GET.get("tipo", "")
    busqueda = request.GET.get("q", "").strip()
    if desde:
        movimientos = movimientos.filter(fecha__gte=desde)
    if hasta:
        movimientos = movimientos.filter(fecha__lte=hasta)
    if tipo in {"INGRESO", "GASTO"}:
        movimientos = movimientos.filter(tipo=tipo)
    if busqueda:
        movimientos = movimientos.filter(
            Q(descripcion__icontains=busqueda)
            | Q(notas__icontains=busqueda)
            | Q(categoria__nombre__icontains=busqueda)
        )
    ingresos = movimientos.filter(tipo="INGRESO").aggregate(total=Sum("monto"))["total"] or Decimal("0")
    gastos = movimientos.filter(tipo="GASTO").aggregate(total=Sum("monto"))["total"] or Decimal("0")
    categorias = list(
        movimientos.filter(tipo="GASTO")
        .values("categoria__nombre", "categoria__color")
        .annotate(total=Sum("monto"))
        .order_by("-total")[:6]
    )
    mayor_gasto = categorias[0]["total"] if categorias else Decimal("0")
    for categoria in categorias:
        categoria["porcentaje"] = round((categoria["total"] / mayor_gasto) * 100) if mayor_gasto else 0
    return render(request, "finanzas/persona_detalle.html", {
        "persona": persona,
        "movimientos": movimientos[:100],
        "ingresos": ingresos,
        "gastos": gastos,
        "balance": ingresos - gastos,
        "categorias": categorias,
        "filtros": {"desde": desde, "hasta": hasta, "tipo": tipo, "q": busqueda},
    })
