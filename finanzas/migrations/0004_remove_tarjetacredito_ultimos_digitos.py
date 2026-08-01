from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("finanzas", "0003_movimiento_notas_persona_movimiento_persona_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="tarjetacredito",
            name="ultimos_digitos",
        ),
    ]
