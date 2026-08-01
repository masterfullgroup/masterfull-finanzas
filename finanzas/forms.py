from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import UserCreationForm

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


class RegistroForm(UserCreationForm):
    first_name = forms.CharField(label="Nombres", max_length=150)
    last_name = forms.CharField(label="Apellidos", max_length=150)
    email = forms.EmailField(label="Correo electrónico")

    class Meta(UserCreationForm.Meta):
        model = get_user_model()
        fields = (
            "first_name", "last_name", "email", "username",
            "password1", "password2",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["username"].help_text = "Usa letras, números y los símbolos @ . + - _."
        self.fields["password1"].help_text = "Mínimo 8 caracteres; evita datos personales y claves comunes."
        self.fields["password2"].help_text = "Repite la misma contraseña para confirmarla."

    def clean_email(self):
        email = self.cleaned_data["email"].strip().lower()
        if get_user_model().objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("Ya existe una cuenta con este correo.")
        return email


class DateInput(forms.DateInput):
    input_type = "date"


class MonthInput(forms.DateInput):
    input_type = "month"


class PersonaForm(forms.ModelForm):
    class Meta:
        model = Persona
        fields = [
            "nombre", "relacion", "email", "telefono",
            "fecha_nacimiento", "color", "activa",
        ]
        widgets = {
            "nombre": forms.TextInput(attrs={"placeholder": "Nombre completo"}),
            "email": forms.EmailInput(attrs={"placeholder": "correo@ejemplo.com"}),
            "telefono": forms.TextInput(attrs={"placeholder": "+51 999 999 999"}),
            "fecha_nacimiento": DateInput(),
            "color": forms.TextInput(attrs={"type": "color"}),
        }


class CuentaForm(forms.ModelForm):
    class Meta:
        model = Cuenta
        fields = [
            "nombre",
            "tipo",
            "saldo_inicial",
            "moneda",
            "activa",
        ]
        widgets = {
            "nombre": forms.TextInput(
                attrs={
                    "placeholder": "Ejemplo: BCP, Yape, efectivo",
                }
            ),
            "saldo_inicial": forms.NumberInput(
                attrs={
                    "step": "0.01",
                    "min": "0",
                }
            ),
            "moneda": forms.TextInput(
                attrs={
                    "placeholder": "PEN",
                    "maxlength": "3",
                }
            ),
        }


class CategoriaForm(forms.ModelForm):
    class Meta:
        model = Categoria
        fields = [
            "nombre",
            "tipo",
            "color",
            "activa",
        ]
        widgets = {
            "nombre": forms.TextInput(
                attrs={
                    "placeholder": "Ejemplo: Luz, agua, alquiler",
                }
            ),
            "color": forms.TextInput(
                attrs={
                    "type": "color",
                }
            ),
        }


class TarjetaCreditoForm(forms.ModelForm):
    class Meta:
        model = TarjetaCredito
        fields = [
            "nombre",
            "entidad",
            "linea_credito",
            "saldo_inicial_usado",
            "dia_cierre",
            "dia_pago",
            "tasa_interes_anual",
            "moneda",
            "activa",
        ]
        widgets = {
            "nombre": forms.TextInput(
                attrs={
                    "placeholder": "Ejemplo: Tarjeta CMR principal",
                }
            ),
            "linea_credito": forms.NumberInput(
                attrs={
                    "step": "0.01",
                    "min": "0.01",
                }
            ),
            "saldo_inicial_usado": forms.NumberInput(
                attrs={
                    "step": "0.01",
                    "min": "0",
                }
            ),
            "dia_cierre": forms.NumberInput(
                attrs={
                    "min": "1",
                    "max": "31",
                }
            ),
            "dia_pago": forms.NumberInput(
                attrs={
                    "min": "1",
                    "max": "31",
                }
            ),
            "tasa_interes_anual": forms.NumberInput(
                attrs={
                    "step": "0.01",
                    "min": "0",
                }
            ),
            "moneda": forms.TextInput(
                attrs={
                    "maxlength": "3",
                    "placeholder": "PEN",
                }
            ),
        }

class MovimientoForm(forms.ModelForm):
    class Meta:
        model = Movimiento
        fields = [
            "persona",
            "tipo",
            "categoria",
            "medio_pago",
            "cuenta",
            "tarjeta_credito",
            "monto",
            "numero_cuotas",
            "fecha",
            "descripcion",
            "notas",
            "comprobante",
        ]
        widgets = {
            "monto": forms.NumberInput(
                attrs={
                    "step": "0.01",
                    "min": "0.01",
                    "placeholder": "0.00",
                }
            ),
            "numero_cuotas": forms.NumberInput(
                attrs={
                    "min": "1",
                    "max": "48",
                }
            ),
            "fecha": DateInput(),
            "descripcion": forms.TextInput(
                attrs={
                    "placeholder": (
                        "Ejemplo: Pago del recibo de luz de julio"
                    ),
                }
            ),
            "notas": forms.Textarea(attrs={
                "rows": 3,
                "placeholder": "Detalles adicionales, referencia o contexto del movimiento",
            }),
        }

    def __init__(
        self,
        *args,
        usuario=None,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)

        if usuario:
            self.fields["persona"].queryset = Persona.objects.filter(
                usuario=usuario,
                activa=True,
            )
            self.fields["cuenta"].queryset = Cuenta.objects.filter(
                usuario=usuario,
                activa=True,
            )

            self.fields[
                "tarjeta_credito"
            ].queryset = TarjetaCredito.objects.filter(
                usuario=usuario,
                activa=True,
            )

            self.fields["categoria"].queryset = Categoria.objects.filter(
                usuario=usuario,
                activa=True,
            )

        self.fields["cuenta"].required = False
        self.fields["persona"].required = False
        self.fields["tarjeta_credito"].required = False
        self.fields["comprobante"].required = False

    def clean(self):
        cleaned_data = super().clean()

        tipo = cleaned_data.get("tipo")
        categoria = cleaned_data.get("categoria")
        medio_pago = cleaned_data.get("medio_pago")
        cuenta = cleaned_data.get("cuenta")
        tarjeta_credito = cleaned_data.get("tarjeta_credito")
        numero_cuotas = cleaned_data.get("numero_cuotas") or 1

        if tipo and categoria and tipo != categoria.tipo:
            self.add_error(
                "categoria",
                "La categoría no corresponde al tipo de movimiento.",
            )

        if medio_pago == "TARJETA_CREDITO":
            if tipo != "GASTO":
                self.add_error(
                    "medio_pago",
                    "La tarjeta de crédito solo puede usarse en gastos.",
                )

            if not tarjeta_credito:
                self.add_error(
                    "tarjeta_credito",
                    "Selecciona la tarjeta de crédito utilizada.",
                )

            cleaned_data["cuenta"] = None

        else:
            if not cuenta:
                self.add_error(
                    "cuenta",
                    "Selecciona la cuenta desde donde salió o ingresó el dinero.",
                )

            if tarjeta_credito:
                self.add_error(
                    "tarjeta_credito",
                    (
                        "No selecciones una tarjeta si el medio de pago "
                        "no es tarjeta de crédito."
                    ),
                )

            if numero_cuotas > 1:
                self.add_error(
                    "numero_cuotas",
                    (
                        "Las cuotas solo pueden utilizarse con "
                        "tarjeta de crédito."
                    ),
                )

        return cleaned_data


class TransferenciaForm(forms.ModelForm):
    class Meta:
        model = Transferencia
        fields = [
            "cuenta_origen",
            "cuenta_destino",
            "monto",
            "fecha",
            "descripcion",
        ]
        widgets = {
            "monto": forms.NumberInput(
                attrs={
                    "step": "0.01",
                    "min": "0.01",
                }
            ),
            "fecha": DateInput(),
            "descripcion": forms.TextInput(
                attrs={
                    "placeholder": "Descripción opcional",
                }
            ),
        }

    def __init__(
        self,
        *args,
        usuario=None,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)

        if usuario:
            cuentas = Cuenta.objects.filter(
                usuario=usuario,
                activa=True,
            )

            self.fields["cuenta_origen"].queryset = cuentas
            self.fields["cuenta_destino"].queryset = cuentas

    def clean(self):
        cleaned_data = super().clean()

        cuenta_origen = cleaned_data.get("cuenta_origen")
        cuenta_destino = cleaned_data.get("cuenta_destino")
        monto = cleaned_data.get("monto")

        if (
            cuenta_origen
            and cuenta_destino
            and cuenta_origen == cuenta_destino
        ):
            self.add_error(
                "cuenta_destino",
                "La cuenta de destino debe ser diferente.",
            )

        if (
            cuenta_origen
            and monto
            and monto > cuenta_origen.saldo_actual
        ):
            self.add_error(
                "monto",
                "La cuenta de origen no tiene saldo suficiente.",
            )

        return cleaned_data


class PagoTarjetaForm(forms.ModelForm):
    class Meta:
        model = PagoTarjeta
        fields = [
            "tarjeta",
            "cuenta",
            "monto",
            "fecha",
            "descripcion",
        ]
        widgets = {
            "monto": forms.NumberInput(
                attrs={
                    "step": "0.01",
                    "min": "0.01",
                }
            ),
            "fecha": DateInput(),
            "descripcion": forms.TextInput(
                attrs={
                    "placeholder": "Ejemplo: Pago total de julio",
                }
            ),
        }

    def __init__(
        self,
        *args,
        usuario=None,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)

        if usuario:
            self.fields["tarjeta"].queryset = (
                TarjetaCredito.objects.filter(
                    usuario=usuario,
                    activa=True,
                )
            )

            self.fields["cuenta"].queryset = Cuenta.objects.filter(
                usuario=usuario,
                activa=True,
            )

    def clean(self):
        cleaned_data = super().clean()

        cuenta = cleaned_data.get("cuenta")
        tarjeta = cleaned_data.get("tarjeta")
        monto = cleaned_data.get("monto")

        if cuenta and monto and monto > cuenta.saldo_actual:
            self.add_error(
                "monto",
                "La cuenta seleccionada no tiene saldo suficiente.",
            )

        if tarjeta and monto and monto > tarjeta.saldo_utilizado:
            self.add_error(
                "monto",
                (
                    "El pago no puede ser mayor que la deuda actual "
                    "de la tarjeta."
                ),
            )

        return cleaned_data


class GastoRecurrenteForm(forms.ModelForm):
    class Meta:
        model = GastoRecurrente
        fields = [
            "nombre",
            "servicio",
            "categoria",
            "medio_pago",
            "cuenta",
            "tarjeta_credito",
            "monto_estimado",
            "frecuencia",
            "proxima_fecha",
            "activo",
        ]
        widgets = {
            "nombre": forms.TextInput(
                attrs={
                    "placeholder": "Ejemplo: Internet del hogar",
                }
            ),
            "monto_estimado": forms.NumberInput(
                attrs={
                    "step": "0.01",
                    "min": "0.01",
                }
            ),
            "proxima_fecha": DateInput(),
        }

    def __init__(
        self,
        *args,
        usuario=None,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)

        if usuario:
            self.fields["categoria"].queryset = Categoria.objects.filter(
                usuario=usuario,
                tipo="GASTO",
                activa=True,
            )

            self.fields["cuenta"].queryset = Cuenta.objects.filter(
                usuario=usuario,
                activa=True,
            )

            self.fields[
                "tarjeta_credito"
            ].queryset = TarjetaCredito.objects.filter(
                usuario=usuario,
                activa=True,
            )

        self.fields["cuenta"].required = False
        self.fields["tarjeta_credito"].required = False

    def clean(self):
        cleaned_data = super().clean()

        medio_pago = cleaned_data.get("medio_pago")
        cuenta = cleaned_data.get("cuenta")
        tarjeta_credito = cleaned_data.get("tarjeta_credito")

        if medio_pago == "TARJETA_CREDITO":
            if not tarjeta_credito:
                self.add_error(
                    "tarjeta_credito",
                    "Selecciona una tarjeta de crédito.",
                )

            cleaned_data["cuenta"] = None

        else:
            if not cuenta:
                self.add_error(
                    "cuenta",
                    "Selecciona la cuenta desde donde se pagará.",
                )

            if tarjeta_credito:
                self.add_error(
                    "tarjeta_credito",
                    (
                        "No selecciones una tarjeta cuando uses "
                        "otro medio de pago."
                    ),
                )

        return cleaned_data


class PresupuestoForm(forms.ModelForm):
    mes = forms.DateField(
        label="Mes",
        input_formats=["%Y-%m"],
        widget=MonthInput(
            format="%Y-%m",
        ),
    )

    class Meta:
        model = Presupuesto
        fields = [
            "categoria",
            "mes",
            "limite",
        ]
        widgets = {
            "limite": forms.NumberInput(
                attrs={
                    "step": "0.01",
                    "min": "0.01",
                }
            ),
        }

    def __init__(
        self,
        *args,
        usuario=None,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)

        if usuario:
            self.fields["categoria"].queryset = Categoria.objects.filter(
                usuario=usuario,
                tipo="GASTO",
                activa=True,
            )

    def clean_mes(self):
        mes = self.cleaned_data["mes"]
        return mes.replace(day=1)


class MetaAhorroForm(forms.ModelForm):
    class Meta:
        model = MetaAhorro
        fields = [
            "nombre",
            "monto_objetivo",
            "monto_actual",
            "fecha_objetivo",
            "completada",
        ]
        widgets = {
            "nombre": forms.TextInput(
                attrs={
                    "placeholder": "Ejemplo: Inicial para una vivienda",
                }
            ),
            "monto_objetivo": forms.NumberInput(
                attrs={
                    "step": "0.01",
                    "min": "0.01",
                }
            ),
            "monto_actual": forms.NumberInput(
                attrs={
                    "step": "0.01",
                    "min": "0",
                }
            ),
            "fecha_objetivo": DateInput(),
        }

    def clean(self):
        cleaned_data = super().clean()

        monto_objetivo = cleaned_data.get("monto_objetivo")
        monto_actual = cleaned_data.get("monto_actual")

        if (
            monto_objetivo is not None
            and monto_actual is not None
            and monto_actual > monto_objetivo
        ):
            self.add_error(
                "monto_actual",
                "El monto ahorrado no puede superar el objetivo.",
            )

        return cleaned_data


class DeudaForm(forms.ModelForm):
    class Meta:
        model = Deuda
        fields = [
            "acreedor",
            "descripcion",
            "monto_total",
            "monto_pagado",
            "fecha_vencimiento",
            "estado",
        ]
        widgets = {
            "acreedor": forms.TextInput(
                attrs={
                    "placeholder": "Persona, banco o empresa",
                }
            ),
            "descripcion": forms.TextInput(
                attrs={
                    "placeholder": "Descripción opcional",
                }
            ),
            "monto_total": forms.NumberInput(
                attrs={
                    "step": "0.01",
                    "min": "0.01",
                }
            ),
            "monto_pagado": forms.NumberInput(
                attrs={
                    "step": "0.01",
                    "min": "0",
                }
            ),
            "fecha_vencimiento": DateInput(),
        }

    def clean(self):
        cleaned_data = super().clean()

        monto_total = cleaned_data.get("monto_total")
        monto_pagado = cleaned_data.get("monto_pagado")
        estado = cleaned_data.get("estado")

        if (
            monto_total is not None
            and monto_pagado is not None
            and monto_pagado > monto_total
        ):
            self.add_error(
                "monto_pagado",
                "El monto pagado no puede superar la deuda total.",
            )

        if (
            estado == "PAGADA"
            and monto_total is not None
            and monto_pagado is not None
            and monto_pagado < monto_total
        ):
            self.add_error(
                "estado",
                (
                    "No puedes marcar la deuda como pagada "
                    "si todavía existe saldo pendiente."
                ),
            )

        return cleaned_data
