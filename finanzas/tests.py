from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .forms import MovimientoForm, TarjetaCreditoForm
from .models import Categoria, Cuenta, Movimiento, Persona, TarjetaCredito


class FinanzasPorPersonaTests(TestCase):
    def setUp(self):
        self.usuario = get_user_model().objects.create_user(
            username="ana", password="clave-segura-123"
        )
        self.persona = Persona.objects.create(
            usuario=self.usuario, nombre="Ana Torres", relacion="TITULAR"
        )
        self.cuenta = Cuenta.objects.create(
            usuario=self.usuario, nombre="Cuenta principal", tipo="BANCO"
        )
        self.ingresos = Categoria.objects.create(
            usuario=self.usuario, nombre="Sueldo", tipo="INGRESO"
        )
        self.gastos = Categoria.objects.create(
            usuario=self.usuario, nombre="Alimentación", tipo="GASTO"
        )
        Movimiento.objects.create(
            usuario=self.usuario,
            persona=self.persona,
            cuenta=self.cuenta,
            categoria=self.ingresos,
            tipo="INGRESO",
            monto=Decimal("2500"),
            fecha=date.today(),
            descripcion="Sueldo mensual",
        )
        Movimiento.objects.create(
            usuario=self.usuario,
            persona=self.persona,
            cuenta=self.cuenta,
            categoria=self.gastos,
            tipo="GASTO",
            monto=Decimal("350"),
            fecha=date.today(),
            descripcion="Supermercado",
        )
        self.client.login(username="ana", password="clave-segura-123")

    def test_dashboard_muestra_balance_y_persona(self):
        response = self.client.get(reverse("dashboard"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Ana Torres")
        self.assertEqual(response.context["balance_mes"], Decimal("2150"))

    def test_detalle_calcula_ingresos_egresos_y_balance(self):
        response = self.client.get(reverse("persona_detalle", args=[self.persona.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["ingresos"], Decimal("2500"))
        self.assertEqual(response.context["gastos"], Decimal("350"))
        self.assertEqual(response.context["balance"], Decimal("2150"))

    def test_usuario_no_puede_ver_persona_ajena(self):
        otro = get_user_model().objects.create_user(username="otro", password="x")
        ajena = Persona.objects.create(usuario=otro, nombre="Perfil privado")
        response = self.client.get(reverse("persona_detalle", args=[ajena.pk]))
        self.assertEqual(response.status_code, 404)

    def test_paginas_principales_renderizan(self):
        rutas = [
            "personas_lista", "movimientos_lista", "cuentas_lista",
            "categorias_lista", "tarjetas_lista", "presupuestos_lista",
            "metas_lista", "deudas_lista", "gastos_recurrentes_lista",
            "pagos_tarjetas_lista", "transferencias_lista", "flujo_mensual", "reportes",
        ]
        for ruta in rutas:
            with self.subTest(ruta=ruta):
                self.assertEqual(self.client.get(reverse(ruta)).status_code, 200)

    def test_formularios_de_tarjeta_y_movimiento_renderizan(self):
        for ruta in ("tarjeta_crear", "movimiento_crear"):
            with self.subTest(ruta=ruta):
                response = self.client.get(reverse(ruta))
                self.assertEqual(response.status_code, 200)
                self.assertContains(response, "payment-guidance")

    def test_flujo_mensual_calcula_totales(self):
        response = self.client.get(
            reverse("flujo_mensual"),
            {"mes": date.today().strftime("%Y-%m")},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["ingresos"], Decimal("2500"))
        self.assertEqual(response.context["egresos"], Decimal("350"))
        self.assertEqual(response.context["balance"], Decimal("2150"))


class AutenticacionTests(TestCase):
    def test_registro_crea_usuario_e_inicia_sesion(self):
        response = self.client.post(
            reverse("registro"),
            {
                "first_name": "María",
                "last_name": "Pérez",
                "email": "maria@example.com",
                "username": "maria",
                "password1": "Una-clave-segura-2026",
                "password2": "Una-clave-segura-2026",
            },
        )

        self.assertRedirects(response, reverse("dashboard"))
        self.assertTrue(get_user_model().objects.filter(username="maria").exists())
        self.assertEqual(int(self.client.session["_auth_user_id"]), get_user_model().objects.get(username="maria").pk)

    def test_login_ofrece_enlace_de_registro(self):
        response = self.client.get(reverse("login"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, reverse("registro"))
        self.assertContains(response, "Masterfull")


class FlujoTarjetasTests(TestCase):
    def setUp(self):
        self.usuario = get_user_model().objects.create_user(
            username="miriam", password="clave-segura-123"
        )
        self.cuenta = Cuenta.objects.create(
            usuario=self.usuario,
            nombre="BCP Miriam",
            tipo="BANCO",
            saldo_inicial=Decimal("1000"),
        )
        self.categoria = Categoria.objects.create(
            usuario=self.usuario,
            nombre="Compras",
            tipo="GASTO",
        )
        self.debito = TarjetaCredito.objects.create(
            usuario=self.usuario,
            tipo="DEBITO",
            nombre="Débito BCP",
            entidad="BCP",
            cuenta_vinculada=self.cuenta,
        )
        self.credito = TarjetaCredito.objects.create(
            usuario=self.usuario,
            tipo="CREDITO",
            nombre="OH Miriam",
            entidad="OH",
            linea_credito=Decimal("3600"),
            dia_cierre=18,
            dia_pago=5,
        )

    def datos_movimiento(self, medio_pago, tarjeta):
        return {
            "tipo": "GASTO",
            "categoria": self.categoria.pk,
            "medio_pago": medio_pago,
            "tarjeta_credito": tarjeta.pk,
            "monto": "50.00",
            "numero_cuotas": "1",
            "fecha": date.today().isoformat(),
            "descripcion": "Compra de prueba",
        }

    def test_debito_descuenta_la_cuenta_vinculada(self):
        datos = self.datos_movimiento("TARJETA_DEBITO", self.debito)
        datos.pop("numero_cuotas")  # El navegador oculta este campo para débito.
        form = MovimientoForm(
            data=datos,
            usuario=self.usuario,
        )
        self.assertTrue(form.is_valid(), form.errors)
        movimiento = form.save(commit=False)
        movimiento.usuario = self.usuario
        movimiento.full_clean()
        movimiento.save()

        self.assertEqual(movimiento.cuenta, self.cuenta)
        self.assertEqual(self.cuenta.saldo_actual, Decimal("950"))

    def test_credito_aumenta_deuda_sin_descontar_cuenta(self):
        form = MovimientoForm(
            data=self.datos_movimiento("TARJETA_CREDITO", self.credito),
            usuario=self.usuario,
        )
        self.assertTrue(form.is_valid(), form.errors)
        movimiento = form.save(commit=False)
        movimiento.usuario = self.usuario
        movimiento.full_clean()
        movimiento.save()

        self.assertIsNone(movimiento.cuenta)
        self.assertEqual(self.cuenta.saldo_actual, Decimal("1000"))
        self.assertEqual(self.credito.saldo_utilizado, Decimal("50"))

    def test_no_permite_combinar_medio_credito_con_tarjeta_debito(self):
        form = MovimientoForm(
            data=self.datos_movimiento("TARJETA_CREDITO", self.debito),
            usuario=self.usuario,
        )
        self.assertFalse(form.is_valid())
        self.assertIn("tarjeta_credito", form.errors)

    def test_tarjeta_debito_exige_cuenta_vinculada(self):
        form = TarjetaCreditoForm(
            data={
                "tipo": "DEBITO",
                "nombre": "Débito sin cuenta",
                "entidad": "BCP",
                "moneda": "PEN",
                "activa": True,
            },
            usuario=self.usuario,
        )
        self.assertFalse(form.is_valid())
        self.assertIn("cuenta_vinculada", form.errors)

    def test_tarjeta_debito_no_exige_campos_de_credito(self):
        form = TarjetaCreditoForm(
            data={
                "tipo": "DEBITO",
                "nombre": "Débito BCP secundaria",
                "entidad": "BCP",
                "cuenta_vinculada": self.cuenta.pk,
                "moneda": "PEN",
                "activa": True,
            },
            usuario=self.usuario,
        )
        self.assertTrue(form.is_valid(), form.errors)

    def test_formulario_muestra_tipo_de_tarjeta_en_cada_opcion(self):
        form = MovimientoForm(usuario=self.usuario)
        html = str(form["tarjeta_credito"])
        self.assertIn('data-tipo-tarjeta="DEBITO"', html)
        self.assertIn('data-tipo-tarjeta="CREDITO"', html)
