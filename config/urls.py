from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("cuentas-usuario/", include("django.contrib.auth.urls")),
    path("", include("finanzas.urls")),
]
