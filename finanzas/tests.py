from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import Categoria, Cuenta, Movimiento, Persona


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
