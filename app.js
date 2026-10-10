import { firebaseReady, firebaseStorageAvailable, getFirebaseServices } from "./js/firebase.js";
import {
  APP_TIME_ZONE, aggregateByMonth, dateInAppTimeZone, monthBounds, shiftMonth,
  fromMinorUnits,
} from "./js/finance.js";
import {
  categoryExpenseTotal, deleteLedgerEntry, deleteReceipt, ensureUserProfile, getProfile, listPage,
  monthTotals, openReceipt, removeDocument, saveDocument, saveLedgerEntry,
  saveMovement, updateUserProfile, uploadReceipt,
} from "./js/data.js";

const PAGE_SIZE = 50;
const REFERENCE_LIMIT = 100;
const REPORT_LIMIT = 500;
const NAV = [
  ["PRINCIPAL"], ["resumen", "home", "Dashboard"],
  ["movimientos", "income", "Ingresos", "INGRESO"], ["movimientos", "expense", "Gastos", "GASTO"],
  ["GESTIÓN"], ["cuentas", "wallet", "Cuentas"], ["tarjetas", "card", "Tarjetas"], ["deudas", "debt", "Deudas"],
  ["movimientos", "transfer", "Movimientos"], ["transferencias", "transfer", "Transferencias"], ["pagosTarjeta", "card", "Pagos de tarjetas"],
  ["personas", "users", "Personas"], ["propietarios", "users", "Titulares"], ["instituciones", "wallet", "Instituciones"], ["categorias", "tag", "Categorías"],
  ["PLANIFICACIÓN"], ["presupuestos", "budget", "Presupuestos"], ["metas", "target", "Metas de ahorro"],
  ["recurrentes", "repeat", "Gastos recurrentes"], ["flujo", "calendar", "Flujo mensual"], ["reportes", "chart", "Reportes"],
  ["CUENTA"], ["perfil", "users", "Mi perfil"],
];

const META = {
  personas: { title: "Personas", eye: "PERFILES DEL HOGAR", singular: "persona", description: "Organiza las finanzas de tu hogar junto a sus integrantes." },
  propietarios: { title: "Titulares", eye: "PERSONAS, EMPRESAS Y CUENTAS COMPARTIDAS", singular: "titular" },
  instituciones: { title: "Instituciones financieras", eye: "BANCOS Y ENTIDADES", singular: "institución" },
  cuentas: { title: "Cuentas", eye: "TU DINERO DISPONIBLE", singular: "cuenta", description: "Consulta tus saldos y organiza las cuentas que registraste." },
  tarjetas: { title: "Tarjetas", eye: "CRÉDITO Y PAGOS", singular: "tarjeta", description: "Administra tus tarjetas y revisa el crédito disponible." },
  categorias: { title: "Categorías", eye: "ORGANIZACIÓN", singular: "categoría" },
  movimientos: { title: "Movimientos", eye: "INGRESOS Y EGRESOS", singular: "movimiento", description: "Revisa y organiza los ingresos y gastos registrados." },
  transferencias: { title: "Transferencias", eye: "ENTRE TUS CUENTAS", singular: "transferencia" },
  pagosTarjeta: { title: "Pagos de tarjetas", eye: "PAGOS DE DEUDA", singular: "pago de tarjeta" },
  presupuestos: { title: "Presupuestos", eye: "CONTROL MENSUAL", singular: "presupuesto", description: "Compara tus gastos del mes con los límites que definiste." },
  metas: { title: "Metas de ahorro", eye: "PLANIFICACIÓN", singular: "meta", description: "Sigue el avance de tus objetivos de ahorro." },
  deudas: { title: "Deudas", eye: "COMPROMISOS", singular: "deuda", description: "Consulta los saldos pendientes de tus deudas registradas." },
  recurrentes: { title: "Gastos recurrentes", eye: "PAGOS PROGRAMADOS", singular: "gasto recurrente" },
};

const OPTIONS = {
  relacion: ["TITULAR", "PAREJA", "HIJO/A", "FAMILIAR", "OTRO"],
  tipoPropietario: ["PERSONA", "EMPRESA", "COMPARTIDA"],
  tipoInstitucion: ["BANCO", "CAJA", "FINANCIERA", "BILLETERA_DIGITAL", "COOPERATIVA", "OTRA"],
  pais: ["PE", "OTRO"],
  tipoCuenta: ["EFECTIVO", "BANCO", "YAPE", "PLIN", "TARJETA_DE_DEBITO", "TARJETA_DE_CREDITO", "AHORRO", "BILLETERA_DIGITAL", "INVERSION", "PRESTAMO", "CREDITO", "CAJA", "OTRO"],
  moneda: ["PEN", "USD", "EUR", "GBP", "JPY", "CLP", "COP", "MXN", "BRL"],
  tipoMovimiento: ["INGRESO", "GASTO"],
  medioPago: ["EFECTIVO", "CUENTA_BANCARIA", "YAPE", "PLIN", "TARJETA_DEBITO", "TARJETA_CREDITO", "OTRO"],
  tipoTarjeta: ["CREDITO", "DEBITO"],
  entidadTarjeta: ["OH", "CMR", "BCP", "INTERBANK", "BBVA", "SCOTIABANK", "OTRA"],
  estadoDeuda: ["PENDIENTE", "PAGADA"],
  servicio: ["LUZ", "AGUA", "INTERNET", "ALQUILER", "GAS", "TELÉFONO", "SEGURO", "OTRO"],
  frecuencia: ["MENSUAL", "QUINCENAL", "SEMANAL", "ANUAL"],
};

const FIELDS = {
  personas: [["nombre", "Nombre completo", "text"], ["relacion", "Relación", "select", "relacion"], ["email", "Correo", "email", null, true], ["telefono", "Teléfono", "tel", null, true], ["fecha_nacimiento", "Fecha de nacimiento", "date", null, true], ["color", "Color", "color", null, true]],
  propietarios: [["nombre", "Nombre del titular", "text"], ["tipo", "Tipo de titular", "select", "tipoPropietario"]],
  instituciones: [["nombre", "Nombre", "text"], ["tipo", "Tipo de institución", "select", "tipoInstitucion"], ["pais", "País", "select", "pais"]],
  cuentas: [["propietario_id", "Titular", "relation", "propietarios"], ["nombre", "Alias de la cuenta", "text"], ["tipo", "Tipo de cuenta", "select", "tipoCuenta"], ["institucion_id", "Institución", "relation", "instituciones", true], ["saldo_inicial", "Saldo inicial", "money"], ["moneda", "Moneda", "select", "moneda"], ["fecha_saldo_inicial", "Fecha del saldo inicial", "date"], ["estado", "Estado", "select", "estadoCuenta", true]],
  tarjetas: [["tipo", "Tipo de tarjeta", "select", "tipoTarjeta"], ["nombre", "Nombre", "text"], ["entidad", "Entidad emisora", "select", "entidadTarjeta"], ["cuenta_id", "Cuenta vinculada (débito)", "relation", "cuentas", true], ["moneda", "Moneda", "select", "moneda"], ["linea_credito", "Línea de crédito", "money", null, true], ["saldo_inicial_usado", "Deuda inicial utilizada", "money", null, true], ["dia_cierre", "Día de cierre", "number", null, true], ["dia_pago", "Día límite de pago", "number", null, true], ["tasa_interes_anual", "Interés anual (%)", "number", null, true]],
  categorias: [["nombre", "Nombre", "text"], ["tipo", "Tipo", "select", "tipoMovimiento"], ["color", "Color", "color", null, true]],
  movimientos: [["tipo", "Tipo", "select", "tipoMovimiento"], ["monto", "Monto", "money"], ["moneda", "Moneda", "select", "moneda"], ["fecha", "Fecha", "date"], ["categoria_id", "Categoría", "relation", "categorias"], ["medio_pago", "Forma de pago", "select", "medioPago"], ["cuenta_id", "Cuenta", "relation", "cuentas", true], ["tarjeta_id", "Tarjeta", "relation", "tarjetas", true], ["numero_cuotas", "Número de cuotas", "number", null, true], ["persona_id", "Persona", "relation", "personas", true], ["descripcion", "Descripción", "text", null, true], ["notas", "Notas", "textarea", null, true]],
  transferencias: [["cuenta_origen_id", "Cuenta de origen", "relation", "cuentas"], ["cuenta_destino_id", "Cuenta de destino", "relation", "cuentas"], ["monto", "Monto", "money"], ["moneda", "Moneda", "select", "moneda"], ["fecha", "Fecha", "date"], ["descripcion", "Descripción", "text", null, true]],
  pagosTarjeta: [["tarjeta_id", "Tarjeta de crédito", "relation", "tarjetas"], ["cuenta_id", "Cuenta de pago", "relation", "cuentas"], ["monto", "Monto", "money"], ["moneda", "Moneda", "select", "moneda"], ["fecha", "Fecha", "date"], ["descripcion", "Descripción", "text", null, true]],
  presupuestos: [["categoria_id", "Categoría de gasto", "relation", "categorias"], ["mes", "Mes", "month"], ["limite", "Límite", "money"], ["moneda", "Moneda", "select", "moneda"]],
  metas: [["nombre", "Nombre de la meta", "text"], ["monto_objetivo", "Monto objetivo", "money"], ["monto_actual", "Monto ahorrado", "money"], ["moneda", "Moneda", "select", "moneda"], ["fecha_objetivo", "Fecha objetivo", "date", null, true]],
  deudas: [["acreedor", "Acreedor", "text"], ["descripcion", "Descripción", "text", null, true], ["monto_total", "Monto total", "money"], ["monto_pagado", "Monto pagado", "money"], ["moneda", "Moneda", "select", "moneda"], ["fecha_vencimiento", "Vencimiento", "date", null, true], ["estado", "Estado", "select", "estadoDeuda"]],
  recurrentes: [["nombre", "Nombre", "text"], ["servicio", "Servicio", "select", "servicio"], ["categoria_id", "Categoría", "relation", "categorias"], ["cuenta_id", "Cuenta de pago", "relation", "cuentas", true], ["tarjeta_id", "Tarjeta", "relation", "tarjetas", true], ["medio_pago", "Forma de pago", "select", "medioPago"], ["monto_estimado", "Monto estimado", "money"], ["moneda", "Moneda", "select", "moneda"], ["frecuencia", "Frecuencia", "select", "frecuencia"], ["proxima_fecha", "Próxima fecha", "date"]],
};

const LIST_FIELDS = {
  personas: ["nombre", "relacion", "email", "telefono"], propietarios: ["nombre", "tipo"],
  instituciones: ["nombre", "tipo", "pais"], cuentas: ["nombre", "propietario_id", "tipo", "institucion_id", "saldo_actual", "moneda"],
  tarjetas: ["nombre", "tipo", "entidad", "utilizado", "linea_credito", "moneda"], categorias: ["nombre", "tipo"],
  movimientos: ["fecha", "tipo", "categoria_id", "origen_movimiento", "medio_pago", "monto", "moneda", "comprobante"],
  transferencias: ["fecha", "cuenta_origen_id", "cuenta_destino_id", "monto", "moneda"],
  pagosTarjeta: ["fecha", "tarjeta_id", "cuenta_id", "monto", "moneda"],
  presupuestos: ["mes", "categoria_id", "limite", "moneda"], metas: ["nombre", "monto_objetivo", "monto_actual", "moneda", "fecha_objetivo"],
  deudas: ["acreedor", "monto_total", "monto_pagado", "moneda", "fecha_vencimiento", "estado"],
  recurrentes: ["nombre", "servicio", "monto_estimado", "moneda", "frecuencia", "proxima_fecha"],
};

const BASE_INSTITUTIONS = [
  ["BCP", "BANCO", "PE"], ["BBVA", "BANCO", "PE"], ["Interbank", "BANCO", "PE"],
  ["Scotiabank", "BANCO", "PE"], ["Banco de la Nación", "BANCO", "PE"], ["BanBif", "BANCO", "PE"],
  ["Banco Pichincha", "BANCO", "PE"], ["Mibanco", "BANCO", "PE"], ["Caja Arequipa", "CAJA", "PE"],
  ["Caja Huancayo", "CAJA", "PE"], ["Caja Piura", "CAJA", "PE"], ["Financiera Oh!", "FINANCIERA", "PE"],
  ["Banco Falabella", "BANCO", "PE"], ["Banco Ripley", "BANCO", "PE"], ["Yape", "BILLETERA_DIGITAL", "PE"],
  ["Plin", "BILLETERA_DIGITAL", "PE"], ["PayPal", "BILLETERA_DIGITAL", "OTRO"], ["Mercado Pago", "BILLETERA_DIGITAL", "OTRO"],
].map(([nombre, tipo, pais], index) => ({ id: `base-${index}`, nombre, tipo, pais, base: true }));

const ACCOUNT_NATURE = { TARJETA_DE_CREDITO: "PASIVO", PRESTAMO: "PASIVO", CREDITO: "PASIVO" };
const CURRENCY_SYMBOLS = { PEN: "S/", USD: "US$", EUR: "€", GBP: "£", JPY: "¥", CLP: "CLP$", COP: "COL$", MXN: "MX$", BRL: "R$" };
const $ = (selector) => document.querySelector(selector);
const state = {
  user: null, profile: {}, page: "resumen", data: {}, entityCursor: null, entityHasMore: false,
  reportRows: [], reportCursor: null, reportHasMore: false, editing: null, filter: {}, busy: false,
  accountFilters: {}, movementAccountFilter: null, dashboardMonth: null, dashboardRange: 6,
};
let services = null;
let authMode = "login";

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  window.setTimeout(() => element.classList.remove("show"), 3200);
}

function money(value, currency = "PEN") {
  const digits = ["JPY", "CLP", "COP"].includes(currency) ? 0 : 2;
  return `${CURRENCY_SYMBOLS[currency] || currency} ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function moneyFromMinor(value, currency = "PEN") {
  return money(fromMinorUnits(value, currency), currency);
}

function todayISO() { return dateInAppTimeZone(); }
function currentMonth() { return todayISO().slice(0, 7); }
function newId() { return crypto.randomUUID(); }

function dateControlMarkup(name, value, kind = "date", required = false, id = "", ariaLabel = "") {
  const normalized = String(value || "");
  const pattern = kind === "month" ? "[0-9]{4}-[0-9]{2}" : "[0-9]{4}-[0-9]{2}-[0-9]{2}";
  const placeholder = kind === "month" ? "aaaa-mm" : "aaaa-mm-dd";
  const label = kind === "month" ? "Elegir mes" : "Elegir fecha";
  const month = normalized.slice(0, 7) || currentMonth();
  return `<span class="date-control" data-date-control data-kind="${kind}" data-view-month="${esc(month)}"><input ${id ? `id="${esc(id)}"` : ""} name="${esc(name)}" data-date-input type="text" inputmode="numeric" autocomplete="off" placeholder="${placeholder}" pattern="${pattern}" title="Usa el formato ${placeholder}" aria-label="${esc(ariaLabel || label)}" value="${esc(normalized)}" ${required ? "required" : ""}><button class="date-open" type="button" data-date-open aria-label="${label}" aria-expanded="false"><svg aria-hidden="true"><use href="#i-calendar"></use></svg></button><div class="date-popover" data-date-popover role="dialog" aria-label="${label}" hidden></div></span>`;
}

function localISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderDatePopover(control) {
  const input = control.querySelector("[data-date-input]");
  const kind = control.dataset.kind;
  const selected = input.value;
  const validDate = kind === "month" ? /^[0-9]{4}-[0-9]{2}$/.test(selected) : /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(selected);
  const initialMonth = validDate ? selected.slice(0, 7) : currentMonth();
  const viewMonth = control.dataset.viewMonth || initialMonth;
  const [year, month] = viewMonth.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1, 12);
  const monthLabel = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: APP_TIME_ZONE }).format(firstDay);
  const monthButtons = kind === "month"
    ? `<div class="date-month-grid">${Array.from({ length: 12 }, (_, index) => {
        const value = `${year}-${String(index + 1).padStart(2, "0")}`;
        const name = new Intl.DateTimeFormat("es-PE", { month: "short", timeZone: APP_TIME_ZONE }).format(new Date(year, index, 1, 12)).replace(".", "");
        return `<button type="button" class="date-month${value === selected ? " is-selected" : ""}" data-date-value="${value}" aria-pressed="${value === selected}">${esc(name)}</button>`;
      }).join("")}</div>`
    : (() => {
        const offset = (firstDay.getDay() + 6) % 7;
        const start = new Date(year, month - 1, 1 - offset, 12);
        const today = todayISO();
        const weekdays = ["L", "M", "X", "J", "V", "S", "D"].map((day) => `<span aria-hidden="true">${day}</span>`).join("");
        const days = Array.from({ length: 42 }, (_, index) => {
          const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12);
          const value = localISODate(date);
          const classes = ["date-day", date.getMonth() !== month - 1 ? "is-outside" : "", value === selected ? "is-selected" : "", value === today ? "is-today" : ""].filter(Boolean).join(" ");
          return `<button type="button" class="${classes}" data-date-value="${value}" aria-pressed="${value === selected}" aria-label="${esc(new Intl.DateTimeFormat("es-PE", { dateStyle: "full", timeZone: APP_TIME_ZONE }).format(date))}">${date.getDate()}</button>`;
        }).join("");
        return `<div class="date-weekdays" aria-hidden="true">${weekdays}</div><div class="date-day-grid">${days}</div>`;
      })();
  const todayValue = kind === "month" ? currentMonth() : todayISO();
  const footer = `<footer class="date-popover-footer"><button type="button" data-date-clear>Limpiar</button><button type="button" data-date-today>Hoy</button></footer>`;
  control.querySelector("[data-date-popover]").innerHTML = `<header class="date-popover-header"><button type="button" data-date-shift="-1" aria-label="${kind === "month" ? "Año anterior" : "Mes anterior"}">‹</button><strong>${esc(monthLabel)}</strong><button type="button" data-date-shift="1" aria-label="${kind === "month" ? "Año siguiente" : "Mes siguiente"}">›</button></header>${monthButtons}${footer}`;
  control.querySelector("[data-date-popover]").dataset.today = todayValue;
}

function closeDatePopovers(except = null) {
  document.querySelectorAll("[data-date-control]").forEach((control) => {
    if (control === except) return;
    control.querySelector("[data-date-popover]").hidden = true;
    control.querySelector("[data-date-open]").setAttribute("aria-expanded", "false");
  });
}

function onDateControlClick(event) {
  const inputTarget = event.target.closest("[data-date-input]");
  const openButton = event.target.closest("[data-date-open]") || (inputTarget && inputTarget.closest("[data-date-control]").querySelector("[data-date-open]"));
  if (openButton) {
    const control = openButton.closest("[data-date-control]");
    const input = control.querySelector("[data-date-input]");
    const pattern = control.dataset.kind === "month" ? /^[0-9]{4}-[0-9]{2}$/ : /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
    if (pattern.test(input.value)) control.dataset.viewMonth = input.value.slice(0, 7);
    closeDatePopovers(control);
    renderDatePopover(control);
    const popover = control.querySelector("[data-date-popover]");
    popover.hidden = false;
    openButton.setAttribute("aria-expanded", "true");
    return;
  }
  const action = event.target.closest("[data-date-shift], [data-date-value], [data-date-today], [data-date-clear]");
  if (!action) {
    if (!event.target.closest("[data-date-control]")) closeDatePopovers();
    return;
  }
  const control = action.closest("[data-date-control]");
  if (!control) return;
  if (action.hasAttribute("data-date-shift")) {
    const [year, month] = control.dataset.viewMonth.split("-").map(Number);
    const date = control.dataset.kind === "month" ? new Date(year + Number(action.dataset.dateShift), month - 1, 1, 12) : new Date(year, month - 1 + Number(action.dataset.dateShift), 1, 12);
    control.dataset.viewMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    renderDatePopover(control);
    return;
  }
  const input = control.querySelector("[data-date-input]");
  const popover = control.querySelector("[data-date-popover]");
  input.value = action.hasAttribute("data-date-today") ? popover.dataset.today : action.hasAttribute("data-date-clear") ? "" : action.dataset.dateValue;
  if (input.value) control.dataset.viewMonth = input.value.slice(0, 7);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  popover.hidden = true;
  control.querySelector("[data-date-open]").setAttribute("aria-expanded", "false");
}

function navHTML() {
  return NAV.map((item) => {
    if (item.length === 1) return `<small>${esc(item[0])}</small>`;
    const [page, iconName, label, movementType] = item;
    return `<a href="#${page}" data-page="${page}" ${movementType ? `data-movement-type="${movementType}"` : ""}><span class="nav-icon"><svg aria-hidden="true"><use href="#i-${iconName}"></use></svg></span><span>${esc(label)}</span></a>`;
  }).join("");
}

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  const toggle = $("#theme-toggle");
  if (toggle) {
    const nextTheme = theme === "dark" ? "claro" : "oscuro";
    toggle.setAttribute("aria-label", `Activar tema ${nextTheme}`);
    toggle.title = `Activar tema ${nextTheme}`;
  }
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === "dark" ? "#0b1420" : "#081827";
  if (persist) {
    try { localStorage.setItem("masterfull-theme", theme); } catch { /* La preferencia sigue activa en esta sesión. */ }
  }
}

function initTheme() {
  let theme = "light";
  try {
    const savedTheme = localStorage.getItem("masterfull-theme");
    if (["light", "dark"].includes(savedTheme)) theme = savedTheme;
  } catch { /* El tema claro es el valor inicial seguro. */ }
  applyTheme(theme);
}

function closeProfileMenu() {
  const menu = $("#profile-menu");
  const trigger = $("#profile-menu-trigger");
  if (!menu || !trigger) return;
  menu.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
}

function closeGlobalSearch() {
  const input = $("#global-search-input");
  const results = $("#global-search-results");
  if (!input || !results) return;
  results.hidden = true;
  input.setAttribute("aria-expanded", "false");
}

function bind() {
  initTheme();
  $("#navigation").innerHTML = navHTML();
  $("#today").textContent = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: APP_TIME_ZONE }).format(new Date());
  window.addEventListener("hashchange", () => void route());
  $("#navigation").addEventListener("click", (event) => {
    const link = event.target.closest("a[data-page]");
    if (!link) return;
    if (link.dataset.movementType) state.filter = { equals: { tipo: link.dataset.movementType } };
    else if (link.dataset.page === "movimientos") state.filter = {};
    closeSidebar();
    if (location.hash === link.getAttribute("href")) void route();
  });
  $("#sidebar-toggle").addEventListener("click", toggleSidebar);
  $("#theme-toggle").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true));
  $("#profile-menu-trigger").addEventListener("click", () => {
    const menu = $("#profile-menu");
    const open = menu.hidden;
    menu.hidden = !open;
    $("#profile-menu-trigger").setAttribute("aria-expanded", String(open));
  });
  $("#profile-menu").addEventListener("click", (event) => {
    if (event.target.closest("a")) closeProfileMenu();
  });
  $("#profile-menu-logout").addEventListener("click", () => services.authSdk.signOut(services.auth));
  $("#global-search-input").addEventListener("input", renderGlobalSearch);
  $("#global-search-input").addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeGlobalSearch();
    if (event.key === "Enter") $("#global-search-results [data-search-entity]")?.click();
  });
  $("#global-search-results").addEventListener("click", (event) => {
    const result = event.target.closest("[data-search-entity][data-search-id]");
    if (!result) return;
    const row = (state.data[result.dataset.searchEntity] || []).find((item) => item.id === result.dataset.searchId);
    if (row) openForm(result.dataset.searchEntity, row);
    closeGlobalSearch();
    $("#global-search-input").value = "";
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".user-menu-wrap")) closeProfileMenu();
    if (!event.target.closest(".global-search")) closeGlobalSearch();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDatePopovers();
    if (event.key === "/" && !event.ctrlKey && !event.metaKey && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      $("#global-search-input").focus();
    }
  });
  document.addEventListener("click", onDateControlClick);
  $("#dashboard-month").addEventListener("change", (event) => {
    state.dashboardMonth = event.target.value || currentMonth();
    const control = event.target.closest("[data-date-control]");
    if (control && event.target.value) control.dataset.viewMonth = event.target.value.slice(0, 7);
    if (state.page === "resumen") void renderDashboard();
  });
  $("#auth-form").addEventListener("submit", submitAuth);
  $("#auth-toggle").addEventListener("click", toggleAuth);
  $("#forgot-password").addEventListener("click", resetPassword);
  $("#logout").addEventListener("click", () => services.authSdk.signOut(services.auth));
  $("#add-main").addEventListener("click", () => openForm(state.page));
  $("#content").addEventListener("click", (event) => void contentClick(event));
  $("#content").addEventListener("change", (event) => {
    if (!event.target.matches("#chart-range")) return;
    state.dashboardRange = Number(event.target.value);
    if (state.page === "resumen") void renderDashboard();
  });
  $("#content").addEventListener("submit", (event) => {
    if (event.target.matches("[data-filter-form]")) { event.preventDefault(); void applyFilters(event.target); }
    if (event.target.matches("[data-account-filter-form]")) { event.preventDefault(); void applyFilters(event.target); }
    if (event.target.matches("[data-profile-form]")) { event.preventDefault(); void saveProfile(event.target); }
  });
  $("#record-form").addEventListener("submit", (event) => void saveForm(event));
  $("#record-form").addEventListener("change", (event) => updateFormFlow(event.target));
}

function toggleSidebar() {
  const open = $("#app").classList.toggle("sidebar-open");
  $("#sidebar-toggle").setAttribute("aria-expanded", String(open));
  $("#sidebar-toggle").setAttribute("aria-label", open ? "Cerrar navegación" : "Abrir navegación");
}

function closeSidebar() {
  $("#app").classList.remove("sidebar-open");
  $("#sidebar-toggle").setAttribute("aria-expanded", "false");
  $("#sidebar-toggle").setAttribute("aria-label", "Abrir navegación");
}

function showAuth(setupMessage = "") {
  $("#auth").classList.remove("hidden");
  $("#app").classList.add("hidden");
  const warning = $("#firebase-setup-warning");
  if (warning) {
    warning.textContent = setupMessage;
    warning.classList.toggle("hidden", !setupMessage);
  }
  $("#auth-form").classList.toggle("hidden", Boolean(setupMessage));
  $("#auth-toggle").classList.toggle("hidden", Boolean(setupMessage));
  $("#forgot-password").classList.toggle("hidden", Boolean(setupMessage));
}

function showApp() {
  $("#auth").classList.add("hidden");
  $("#app").classList.remove("hidden");
  const displayName = state.profile.displayName || state.user.displayName || state.user.email?.split("@")[0] || "Mi cuenta";
  $("#profile-name").textContent = displayName;
  $("#avatar").textContent = displayName.trim()[0]?.toUpperCase() || "M";
  $("#profile-name-top").textContent = displayName;
  $("#avatar-top").textContent = displayName.trim()[0]?.toUpperCase() || "M";
  $("#profile-mode").textContent = "Datos protegidos";
}

function toggleAuth() {
  authMode = authMode === "login" ? "signup" : "login";
  const signingUp = authMode === "signup";
  $("#auth-name-field").classList.toggle("hidden", !signingUp);
  $("#auth-name").required = signingUp;
  $("#auth-title").textContent = signingUp ? "Crea tu cuenta" : "Bienvenido de nuevo";
  $("#auth-copy").textContent = signingUp ? "Tus finanzas estarán separadas y protegidas." : "Ingresa para continuar organizando tus finanzas.";
  $("#auth-submit").textContent = signingUp ? "Crear cuenta" : "Iniciar sesión";
  $("#auth-toggle").textContent = signingUp ? "¿Ya tienes cuenta? Iniciar sesión" : "¿No tienes cuenta? Crear cuenta";
}

function authError(error) {
  const messages = {
    "auth/invalid-credential": "El correo o la contraseña no son correctos.",
    "auth/email-already-in-use": "Ya existe una cuenta con ese correo.",
    "auth/weak-password": "La contraseña debe cumplir la política configurada en Firebase.",
    "auth/too-many-requests": "Hubo demasiados intentos. Espera un momento e inténtalo de nuevo.",
    "auth/operation-not-allowed": "Activa el proveedor Correo/contraseña en Firebase Authentication.",
    "auth/network-request-failed": "No se pudo conectar con Firebase. Revisa la configuración y tu conexión.",
  };
  return messages[error?.code] || error?.message || "No se pudo completar la operación.";
}

async function submitAuth(event) {
  event.preventDefault();
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  try {
    if (authMode === "signup") {
      const name = $("#auth-name").value.trim();
      const credential = await services.authSdk.createUserWithEmailAndPassword(services.auth, email, password);
      await services.authSdk.updateProfile(credential.user, { displayName: name });
      await ensureUserProfile(credential.user);
      await saveDocument(credential.user.uid, "propietarios", { nombre: "Compartida", tipo: "COMPARTIDA", estado: "ACTIVO" });
      toast("Cuenta creada. Ya puedes organizar tus finanzas.");
    } else {
      await services.authSdk.signInWithEmailAndPassword(services.auth, email, password);
    }
  } catch (error) { toast(authError(error)); }
}

async function resetPassword() {
  const email = $("#auth-email").value.trim();
  if (!email) { toast("Escribe tu correo para enviarte el enlace de recuperación."); $("#auth-email").focus(); return; }
  try {
    await services.authSdk.sendPasswordResetEmail(services.auth, email);
    toast("Si la cuenta existe, Firebase enviará las instrucciones de recuperación.");
  } catch (error) { toast(authError(error)); }
}

async function loadReferenceData() {
  const names = ["cuentas", "tarjetas", "personas", "propietarios", "instituciones", "categorias"];
  const pages = await Promise.all(names.map((name) => listPage(state.user.uid, name, { limit: REFERENCE_LIMIT, orderField: "nombre", direction: "asc" })));
  names.forEach((name, index) => { state.data[name] = pages[index].rows; });
  state.data.instituciones = [...BASE_INSTITUTIONS, ...pages[names.indexOf("instituciones")].rows];
}

async function onSignedIn(user) {
  state.user = user;
  await ensureUserProfile(user);
  state.profile = await getProfile(user.uid);
  showApp();
  await loadReferenceData();
  await route();
}

async function route() {
  state.page = (location.hash || "#resumen").slice(1);
  if (state.page === "dashboard") state.page = "resumen";
  if (state.page === "personas_lista") state.page = "personas";
  if (!["resumen", "flujo", "reportes", "perfil", ...Object.keys(FIELDS)].includes(state.page)) state.page = "resumen";
  const movementType = state.filter.equals?.tipo || "";
  document.querySelectorAll("#navigation a").forEach((link) => {
    const matchingType = link.dataset.movementType ? link.dataset.movementType === movementType : link.dataset.page === "movimientos" ? !movementType : true;
    link.classList.toggle("active", link.dataset.page === state.page && matchingType);
  });
  const fallbackTitles = { flujo: "Flujo mensual", reportes: "Reportes", perfil: "Mi perfil" };
  const info = META[state.page] || { title: fallbackTitles[state.page] || "Finanzas", eye: "TU ESPACIO FINANCIERO" };
  if (state.page === "resumen") {
    const name = state.profile.displayName || state.user?.displayName || state.user?.email?.split("@")[0] || "";
    const firstName = name.trim().split(/\s+/)[0];
    $("#page-title").textContent = firstName ? `Hola, ${firstName} 👋` : "Dashboard";
    $("#page-description").textContent = "Aquí tienes un resumen de tu situación financiera.";
  } else {
    $("#page-title").textContent = info.title;
    $("#page-description").textContent = info.description || "";
  }
  $("#page-eyebrow").textContent = info.eye;
  $("#dashboard-period-control").classList.toggle("hidden", state.page !== "resumen");
  $("#today").classList.toggle("hidden", state.page === "resumen");
  $("#dashboard-month").value = state.dashboardMonth || currentMonth();
  closeProfileMenu();
  $("#add-main").classList.toggle("hidden", !FIELDS[state.page]);
  state.entityCursor = null;
  state.entityHasMore = false;
  if (state.page === "resumen") return renderDashboard();
  if (state.page === "perfil") return renderProfile();
  if (["flujo", "reportes"].includes(state.page)) return loadReports(false);
  if (state.page === "cuentas") return renderAccounts();
  return loadEntityPage(false);
}

function renderGlobalSearch() {
  const input = $("#global-search-input");
  const results = $("#global-search-results");
  const query = input.value.trim().toLocaleLowerCase("es-PE");
  if (!state.user || query.length < 2) {
    closeGlobalSearch();
    return;
  }
  const matches = [];
  for (const [entity, rows] of Object.entries(state.data)) {
    if (!FIELDS[entity]) continue;
    for (const row of rows) {
      const title = row.descripcion || row.nombre || row.acreedor || row.servicio || row.entidad || row.email || optionLabel(row.tipo) || "Registro";
      const searchable = [title, ...(LIST_FIELDS[entity] || []).map((field) => {
        const value = row[field];
        return field.endsWith("_id") ? relationLabel(field, value) : value;
      })].filter((value) => ["string", "number"].includes(typeof value)).join(" ").toLocaleLowerCase("es-PE");
      if (!searchable.includes(query)) continue;
      const subtitle = [META[entity]?.title || "Registro", row.fecha || row.mes?.slice(0, 7)].filter(Boolean).join(" · ");
      matches.push(`<button class="search-result" type="button" role="option" data-search-entity="${esc(entity)}" data-search-id="${esc(row.id)}"><span class="search-result-icon"><svg aria-hidden="true"><use href="#i-${entity === "movimientos" ? row.tipo === "INGRESO" ? "income" : "expense" : entity === "cuentas" ? "wallet" : entity === "tarjetas" ? "card" : "chart"}"></use></svg></span><span class="search-result-copy"><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span><span class="search-result-action">Editar</span></button>`);
      if (matches.length >= 6) break;
    }
    if (matches.length >= 6) break;
  }
  results.innerHTML = matches.length
    ? `<p class="search-results-label">Coincidencias en los registros cargados</p>${matches.join("")}`
    : `<p class="search-empty">No encontramos coincidencias en los datos cargados.</p>`;
  results.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function pageLoading(message = "Cargando…") {
  $("#content").innerHTML = `<section class="panel"><p class="empty">${esc(message)}</p></section>`;
}

function trendMarkup(current, previous, kind) {
  if (!previous) return `<span class="metric-trend is-muted">Sin comparación previa</span>`;
  const delta = current - previous;
  if (!delta) return `<span class="metric-trend is-muted">Sin variación vs. mes anterior</span>`;
  const change = Math.round(Math.abs(delta) / Math.abs(previous) * 100);
  const favorable = kind === "expense" ? delta < 0 : delta > 0;
  const direction = delta > 0 ? "↑" : "↓";
  return `<span class="metric-trend ${favorable ? "is-positive" : "is-negative"}" aria-label="${favorable ? "Cambio favorable" : "Cambio desfavorable"} del ${change} por ciento respecto al mes anterior"><span aria-hidden="true">${direction}</span>${change}% <small>vs. mes anterior</small></span>`;
}

function dashboardMetric(label, valueMinor, currency, iconName, tone, detail, trend = "") {
  return `<article class="metric-card"><span class="metric-icon is-${tone}"><svg aria-hidden="true"><use href="#i-${iconName}"></use></svg></span><div class="metric-copy"><span class="metric-label">${esc(label)}</span><strong class="metric-value ${tone === "expense" || tone === "saving" && valueMinor < 0 ? "is-negative" : ""}">${esc(moneyFromMinor(valueMinor, currency))}</strong><span class="metric-detail">${esc(detail)}</span>${trend}</div></article>`;
}

function axisMoney(valueMinor, currency) {
  const value = fromMinorUnits(valueMinor, currency);
  const digits = ["JPY", "CLP", "COP"].includes(currency) ? 0 : 0;
  const amount = new Intl.NumberFormat("es-PE", { maximumFractionDigits: digits, notation: Math.abs(value) >= 100000 ? "compact" : "standard" }).format(value);
  return `${CURRENCY_SYMBOLS[currency] || currency} ${amount}`;
}

function financialChartSvg(history, currency) {
  const width = 720;
  const height = 262;
  const margin = { top: 18, right: 18, bottom: 38, left: 78 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  let cumulative = 0;
  const rows = history.map((row) => {
    cumulative += row.incomeMinor - row.expenseMinor;
    return { ...row, cumulativeMinor: cumulative };
  });
  const values = rows.flatMap((row) => [row.incomeMinor, row.expenseMinor, row.cumulativeMinor]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = Math.max(max - min, 100);
  const y = (value) => margin.top + ((max - value) / range) * plotHeight;
  const zeroY = y(0);
  const step = plotWidth / Math.max(rows.length, 1);
  const barWidth = Math.min(16, step * 0.2);
  const ticks = Array.from({ length: 5 }, (_, index) => min + (range * index) / 4);
  const grid = ticks.map((value) => `<g><line x1="${margin.left}" y1="${y(value)}" x2="${width - margin.right}" y2="${y(value)}" class="chart-gridline"/><text x="${margin.left - 12}" y="${y(value) + 4}" text-anchor="end" class="chart-axis-label">${esc(axisMoney(value, currency))}</text></g>`).join("");
  const bars = rows.map((row, index) => {
    const center = margin.left + step * (index + 0.5);
    const incomeY = y(row.incomeMinor);
    const expenseY = y(row.expenseMinor);
    return `<rect x="${center - barWidth - 2}" y="${Math.min(incomeY, zeroY)}" width="${barWidth}" height="${Math.max(Math.abs(zeroY - incomeY), 1)}" rx="3" class="chart-bar-income"><title>Ingresos ${esc(row.month)}: ${esc(moneyFromMinor(row.incomeMinor, currency))}</title></rect><rect x="${center + 2}" y="${Math.min(expenseY, zeroY)}" width="${barWidth}" height="${Math.max(Math.abs(zeroY - expenseY), 1)}" rx="3" class="chart-bar-expense"><title>Gastos ${esc(row.month)}: ${esc(moneyFromMinor(row.expenseMinor, currency))}</title></rect><text x="${center}" y="${height - 10}" text-anchor="middle" class="chart-axis-label">${esc(new Intl.DateTimeFormat("es-PE", { month: "short", timeZone: APP_TIME_ZONE }).format(new Date(`${row.month}-01T12:00:00`)).replace(".", ""))}</text>`;
  }).join("");
  const points = rows.map((row, index) => ({ x: margin.left + step * (index + 0.5), y: y(row.cumulativeMinor), value: row.cumulativeMinor }));
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const circles = points.map((point, index) => `<circle cx="${point.x}" cy="${point.y}" r="3.5" class="chart-line-dot"><title>Balance acumulado del periodo hasta ${esc(rows[index].month)}: ${esc(moneyFromMinor(point.value, currency))}</title></circle>`).join("");
  return `<svg class="financial-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Ingresos, gastos y balance acumulado del periodo en ${esc(currency)}"><title>Evolución de ingresos, gastos y balance acumulado</title><desc>Comparación mensual de ingresos y gastos. El balance acumulado suma ingresos menos gastos desde el primer mes visible; no es el saldo bancario.</desc>${grid}<line x1="${margin.left}" y1="${zeroY}" x2="${width - margin.right}" y2="${zeroY}" class="chart-zero-line"/><g>${bars}</g><path d="${line}" class="chart-net-line"/>${circles}</svg>`;
}

function donutMarkup(categories, categoryName, currency, sampled) {
  const palette = ["#10B981", "#3B82F6", "#F59E0B", "#A78BFA", "#EF6A5B", "#14B8A6"];
  const ranked = categories.sort((a, b) => b[1] - a[1]);
  const visible = ranked.slice(0, 4).map(([id, amount]) => [categoryName(id), amount]);
  const others = ranked.slice(4).reduce((sum, [, amount]) => sum + amount, 0);
  if (others > 0) visible.push(["Otras categorías", others]);
  const total = visible.reduce((sum, [, amount]) => sum + amount, 0);
  if (!total) return `<div class="dashboard-empty compact-empty"><span class="empty-mark"><svg aria-hidden="true"><use href="#i-chart"></use></svg></span><strong>Aún no hay gastos para analizar</strong><p>Los gastos que registres aparecerán aquí.</p></div>`;
  let offset = 0;
  const stops = visible.map(([, amount], index) => {
    const portion = amount / total * 100;
    const stop = `${palette[index % palette.length]} ${offset.toFixed(2)}% ${(offset + portion).toFixed(2)}%`;
    offset += portion;
    return stop;
  }).join(",");
  const legend = visible.map(([name, amount], index) => `<li><span class="donut-label"><i style="--legend-color:${palette[index % palette.length]}"></i>${esc(name)}</span><strong>${Math.round(amount / total * 100)}%</strong></li>`).join("");
  return `<div class="donut-content"><div class="donut-chart" style="--donut-stops:conic-gradient(${stops})" role="img" aria-label="Distribución de gastos registrados: ${esc(moneyFromMinor(total, currency))}"><div class="donut-center"><strong>${esc(moneyFromMinor(total, currency))}</strong><span>${sampled ? "Muestra" : "Total del periodo"}</span></div></div><ul class="donut-legend">${legend}</ul></div>${sampled ? `<p class="sample-note">Distribución calculada con los 100 movimientos más recientes del periodo.</p>` : ""}`;
}

function shortDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", timeZone: APP_TIME_ZONE }).format(date).replace(".", "");
}

async function renderDashboard() {
  pageLoading();
  try {
    const currency = state.profile.currency || "PEN";
    const selectedMonth = state.dashboardMonth || currentMonth();
    const range = [6, 12].includes(Number(state.dashboardRange)) ? Number(state.dashboardRange) : 6;
    state.dashboardRange = range;
    const months = Array.from({ length: range }, (_, index) => shiftMonth(selectedMonth, index - range + 1));
    const { start, end } = monthBounds(selectedMonth);
    const [monthlyHistory, recent, budgetPage, goalPage, debtPage] = await Promise.all([
      Promise.all(months.map(async (month) => {
        const bounds = monthBounds(month);
        return { month, ...await monthTotals(state.user.uid, bounds.start, bounds.end, currency) };
      })),
      listPage(state.user.uid, "movimientos", { limit: 100, orderField: "fecha", direction: "desc", startDate: start, endDate: end, equals: { moneda: currency } }),
      listPage(state.user.uid, "presupuestos", { limit: 100, orderField: "mes", direction: "desc", equals: { mes: `${selectedMonth}-01`, moneda: currency } }),
      listPage(state.user.uid, "metas", { limit: 4, orderField: "createdAt", direction: "desc" }),
      listPage(state.user.uid, "deudas", { limit: 100, orderField: "createdAt", direction: "desc" }),
    ]);
    const totals = monthlyHistory.at(-1) || { incomeMinor: 0, expenseMinor: 0 };
    const previous = monthlyHistory.at(-2) || { incomeMinor: 0, expenseMinor: 0 };
    const savingsMinor = totals.incomeMinor - totals.expenseMinor;
    const activeAccounts = (state.data.cuentas || []).filter((item) => !["ARCHIVADA", "INACTIVA"].includes(item.estado));
    const accountBalanceMinor = activeAccounts.filter((item) => (item.moneda || "PEN") === currency)
      .reduce((sum, item) => sum + Number(item.saldoActualMinor ?? item.saldoInicialMinor ?? 0), 0);
    const monthExpenses = recent.rows.filter((movement) => movement.tipo === "GASTO");
    const categoryTotals = monthExpenses.reduce((acc, movement) => {
      acc[movement.categoria_id || "sin-categoria"] = (acc[movement.categoria_id || "sin-categoria"] || 0) + Number(movement.montoMinor || 0);
      return acc;
    }, {});
    const topCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
    const debtByCurrency = debtPage.rows.reduce((groups, debt) => {
      const code = debt.moneda || "PEN";
      groups[code] = (groups[code] || 0) + Math.max(0, Number(debt.montoTotalMinor || 0) - Number(debt.montoPagadoMinor || 0));
      return groups;
    }, {});
    const budgets = await Promise.all(budgetPage.rows.map(async (budget) => ({
      ...budget,
      spentMinor: await categoryExpenseTotal(state.user.uid, budget.categoria_id, start, end, currency),
    })));
    const categoryName = (id) => state.data.categorias.find((item) => item.id === id)?.nombre || (id === "sin-categoria" ? "Sin categoría" : "Categoría" );
    const monthTitle = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: APP_TIME_ZONE }).format(new Date(`${selectedMonth}-01T12:00:00`));
    state.data.movimientos = recent.rows;

    const metricCards = [
      dashboardMetric("Saldo total", accountBalanceMinor, currency, "wallet", "balance", `${activeAccounts.filter((item) => (item.moneda || "PEN") === currency).length} cuentas · ${currency}`),
      dashboardMetric("Ingresos", totals.incomeMinor, currency, "income", "income", monthTitle, trendMarkup(totals.incomeMinor, previous.incomeMinor, "income")),
      dashboardMetric("Gastos", totals.expenseMinor, currency, "expense", "expense", monthTitle, trendMarkup(totals.expenseMinor, previous.expenseMinor, "expense")),
      dashboardMetric("Ahorro del periodo", savingsMinor, currency, "piggy", "saving", totals.incomeMinor ? `${Math.round(savingsMinor / totals.incomeMinor * 100)}% de tus ingresos` : "Sin ingresos registrados en este periodo", trendMarkup(savingsMinor, previous.incomeMinor - previous.expenseMinor, "saving")),
    ].join("");

    const chartRows = monthlyHistory.map((item) => ({ ...item, cumulativeMinor: 0 }));
    const chartRowsLabel = monthlyHistory.length === 12 ? "Últimos 12 meses" : "Últimos 6 meses";
    const chartRowsSvg = financialChartSvg(chartRows, currency);
    const recentRows = recent.rows.slice(0, 5).map((item) => {
      const income = item.tipo === "INGRESO";
      const typeLabel = income ? "Ingreso" : "Gasto";
      const description = item.descripcion || categoryName(item.categoria_id);
      return `<tr><td class="recent-date">${esc(shortDate(item.fecha))}</td><td><span class="recent-description"><i class="movement-type-icon ${income ? "is-income" : "is-expense"}"><svg aria-hidden="true"><use href="#i-${income ? "income" : "expense"}"></use></svg></i><strong>${esc(description)}</strong></span></td><td class="recent-category">${esc(categoryName(item.categoria_id))}</td><td class="recent-amount ${income ? "is-income" : "is-expense"}">${income ? "+" : "−"}${esc(moneyFromMinor(item.montoMinor, item.moneda))}</td><td><span class="movement-badge ${income ? "is-income" : "is-expense"}">${typeLabel}</span></td><td><div class="recent-actions"><button type="button" data-edit="movimientos" data-id="${esc(item.id)}">Editar</button><button type="button" class="is-danger" data-delete="movimientos" data-id="${esc(item.id)}">Eliminar</button></div></td></tr>`;
    }).join("");
    const accounts = activeAccounts.filter((item) => (item.moneda || "PEN") === currency).slice(0, 4);
    const accountRows = accounts.map((item) => `<div class="compact-account"><span class="compact-account-icon"><svg aria-hidden="true"><use href="#i-wallet"></use></svg></span><span class="compact-account-copy"><strong>${esc(item.nombre || "Cuenta")}</strong><small>${esc(optionLabel(item.tipo))}${item.institucion_id ? ` · ${esc(relationLabel("institucion_id", item.institucion_id))}` : ""}</small></span><strong class="compact-account-balance">${esc(moneyFromMinor(item.saldoActualMinor ?? item.saldoInicialMinor, item.moneda || currency))}</strong></div>`).join("");
    const cards = (state.data.tarjetas || []).slice(0, 2).map((item) => {
      const credit = item.tipo === "CREDITO";
      const amount = credit ? Math.max(0, Number(item.lineaCreditoMinor || 0) - Number(item.utilizadoMinor ?? item.saldoInicialUsadoMinor ?? 0)) : null;
      const linkedAccount = (state.data.cuentas || []).find((account) => account.id === item.cuenta_id);
      const details = credit ? `Disponible · ${moneyFromMinor(amount, item.moneda || currency)}` : linkedAccount ? `Saldo vinculado · ${moneyFromMinor(linkedAccount.saldoActualMinor ?? linkedAccount.saldoInicialMinor, linkedAccount.moneda || currency)}` : "Tarjeta de débito";
      return `<article class="bank-card-preview"><div class="bank-card-top"><span>MASTERFULL <small>FINANZAS</small></span><svg aria-hidden="true"><use href="#i-chip"></use></svg></div><strong class="bank-card-name">${esc(item.nombre || optionLabel(item.entidad) || "Tarjeta")}</strong><div class="bank-card-bottom"><span>${esc(credit ? "Crédito" : "Débito")}${item.entidad ? ` · ${esc(optionLabel(item.entidad))}` : ""}</span><strong>${esc(details)}</strong></div><span class="bank-card-security">Identificación protegida</span></article>`;
    }).join("");
    const budgetsMarkup = budgets.length ? budgets.slice(0, 4).map((item) => `<div class="budget-line"><div class="budget-line-head"><span>${esc(categoryName(item.categoria_id))}</span><strong>${esc(moneyFromMinor(item.spentMinor, currency))}<small> / ${esc(moneyFromMinor(item.limiteMinor, currency))}</small></strong></div><progress max="${Math.max(item.limiteMinor, 1)}" value="${Math.min(item.spentMinor, item.limiteMinor)}" aria-label="${esc(categoryName(item.categoria_id))}: ${esc(moneyFromMinor(item.spentMinor, currency))} de ${esc(moneyFromMinor(item.limiteMinor, currency))}"></progress></div>`).join("") : `<div class="dashboard-empty inline-empty"><strong>Aún no tienes presupuestos</strong><p>Define un límite por categoría para controlar tus gastos.</p><a class="link-button" href="#presupuestos">Configurar presupuesto</a></div>`;
    const goalsMarkup = goalPage.rows.length ? goalPage.rows.map((goal) => `<div class="budget-line"><div class="budget-line-head"><span>${esc(goal.nombre)}</span><strong>${esc(money(goal.monto_actual, goal.moneda))}<small> / ${esc(money(goal.monto_objetivo, goal.moneda))}</small></strong></div><progress max="${Math.max(Number(goal.monto_objetivo), 1)}" value="${Math.min(Number(goal.monto_actual), Number(goal.monto_objetivo))}" aria-label="${esc(goal.nombre)}"></progress></div>`).join("") : `<div class="dashboard-empty inline-empty"><strong>Sin metas de ahorro</strong><p>Cuando registres una meta, podrás seguir su avance aquí.</p><a class="link-button" href="#metas">Ver metas</a></div>`;
    const debtMarkup = Object.entries(debtByCurrency).length
      ? Object.entries(debtByCurrency).map(([code, amount]) => `<div class="debt-total-row"><span>Saldo pendiente · ${esc(code)}</span><strong>${esc(moneyFromMinor(amount, code))}</strong></div>`).join("")
      : `<div class="dashboard-empty inline-empty"><strong>Sin deudas registradas</strong><p>Las deudas que agregues se resumirán aquí.</p><a class="link-button" href="#deudas">Ver deudas</a></div>`;

    $("#content").innerHTML = `
      <section class="dashboard-metrics" aria-label="Resumen del periodo">${metricCards}</section>
      <div class="dashboard-grid">
        <div class="dashboard-main-column">
          <section class="panel dashboard-panel chart-panel"><header class="dashboard-panel-head"><div><h2>Evolución de tus finanzas</h2><p class="caption">Ingresos, gastos y balance neto acumulado · ${esc(currency)}</p></div><label class="select-control"><span class="sr-only">Periodo del gráfico</span><select id="chart-range"><option value="6" ${range === 6 ? "selected" : ""}>Últimos 6 meses</option><option value="12" ${range === 12 ? "selected" : ""}>Últimos 12 meses</option></select><svg aria-hidden="true"><use href="#i-chevron"></use></svg></label></header><div class="chart-legend"><span><i class="legend-income"></i>Ingresos</span><span><i class="legend-expense"></i>Gastos</span><span><i class="legend-net"></i>Balance acumulado</span></div>${chartRowsSvg}<p class="chart-footnote">El balance acumulado suma ingresos menos gastos desde el inicio del periodo; no representa el saldo de tus cuentas.</p></section>
          <section class="panel dashboard-panel recent-panel"><header class="dashboard-panel-head"><div><h2>Movimientos recientes</h2><p class="caption">${esc(monthTitle)} · últimos registros</p></div><a class="link-button" href="#movimientos">Ver todos <span aria-hidden="true">→</span></a></header>${recentRows ? `<div class="table-scroll"><table class="dashboard-table"><thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Monto</th><th>Tipo</th><th>Acciones</th></tr></thead><tbody>${recentRows}</tbody></table></div>${recent.hasMore ? `<p class="table-note">Se muestran los cinco más recientes. El resumen mensual usa agregados completos.</p>` : ""}` : `<div class="dashboard-empty"><span class="empty-mark"><svg aria-hidden="true"><use href="#i-transfer"></use></svg></span><strong>Aún no hay movimientos en ${esc(monthTitle)}</strong><p>Los ingresos y gastos que registres aparecerán aquí.</p><button type="button" class="btn primary" data-new="movimientos" data-type="INGRESO">Registrar ingreso</button></div>`}</section>
        </div>
        <aside class="dashboard-side-column">
          <section class="panel dashboard-panel distribution-panel"><header class="dashboard-panel-head"><div><h2>Distribución de gastos</h2><p class="caption">${esc(monthTitle)}</p></div></header>${donutMarkup(topCategories, categoryName, currency, recent.hasMore)}</section>
          <section class="panel dashboard-panel accounts-panel"><header class="dashboard-panel-head"><div><h2>Mis cuentas</h2><p class="caption">Saldos en ${esc(currency)}</p></div><a class="link-button" href="#cuentas">Ver todas</a></header>${accountRows || `<div class="dashboard-empty compact-empty"><span class="empty-mark"><svg aria-hidden="true"><use href="#i-wallet"></use></svg></span><strong>Aún no tienes cuentas</strong><p>Agrega una cuenta para consultar tu saldo.</p><a class="link-button" href="#cuentas">Ir a cuentas</a></div>`}</section>
          <section class="panel dashboard-panel cards-panel"><header class="dashboard-panel-head"><div><h2>Mis tarjetas</h2><p class="caption">Información protegida</p></div><a class="link-button" href="#tarjetas">Ver todas</a></header>${cards || `<div class="dashboard-empty compact-empty"><span class="empty-mark"><svg aria-hidden="true"><use href="#i-card"></use></svg></span><strong>Aún no tienes tarjetas</strong><p>Las tarjetas que registres aparecerán aquí.</p></div>`}</section>
        </aside>
      </div>
      <div class="dashboard-lower-grid">
        <section class="panel dashboard-panel lower-panel"><header class="dashboard-panel-head"><div><h2>Presupuestos del mes</h2><p class="caption">Gastos registrados frente a tus límites</p></div><a class="link-button" href="#presupuestos">Gestionar</a></header>${budgetsMarkup}</section>
        <section class="panel dashboard-panel lower-panel"><header class="dashboard-panel-head"><div><h2>Planificación</h2><p class="caption">Deudas y objetivos registrados</p></div></header><div class="planning-block"><div class="planning-block-head"><h3>Deudas pendientes</h3><a class="link-button" href="#deudas">Ver deudas</a></div>${debtMarkup}</div><div class="planning-block"><div class="planning-block-head"><h3>Metas de ahorro</h3><a class="link-button" href="#metas">Ver metas</a></div>${goalsMarkup}</div></section>
      </div>`;
  } catch (error) { showDataError(error); }
}

async function loadEntityPage(append) {
  const entity = state.page;
  if (!FIELDS[entity]) return;
  if (!append) pageLoading();
  try {
    const options = { limit: PAGE_SIZE, cursor: append ? state.entityCursor : null, orderField: entity === "movimientos" || entity === "transferencias" || entity === "pagosTarjeta" ? "fecha" : "createdAt", direction: "desc", equals: { ...(state.filter.equals || {}), ...(entity === "movimientos" && state.movementAccountFilter ? { cuenta_id: state.movementAccountFilter } : {}) }, startDate: state.filter.startDate, endDate: state.filter.endDate };
    const result = await listPage(state.user.uid, entity, options);
    const old = append ? (state.data[entity] || []) : [];
    state.data[entity] = [...old, ...result.rows];
    state.entityCursor = result.cursor;
    state.entityHasMore = result.hasMore;
    renderEntity(entity);
  } catch (error) { showDataError(error); }
}

function renderAccounts() {
  const currency = state.profile.currency || "PEN";
  const all = (state.data.cuentas || []).filter((item) => item.estado !== "ARCHIVADA");
  const active = all.filter((item) => item.estado !== "INACTIVA");
  const filters = state.accountFilters;
  const query = (filters.q || "").trim().toLocaleLowerCase("es-PE");
  const rows = all.filter((item) => (!query || `${item.nombre} ${relationLabel("propietario_id", item.propietario_id)} ${relationLabel("institucion_id", item.institucion_id)}`.toLocaleLowerCase("es-PE").includes(query))
    && (!filters.tipo || item.tipo === filters.tipo) && (!filters.estado || item.estado === filters.estado)
    && (!filters.moneda || item.moneda === filters.moneda));
  const totals = active.reduce((group, item) => {
    const code = item.moneda || "PEN";
    group[code] = (group[code] || 0) + Number(item.saldoActualMinor ?? item.saldoInicialMinor ?? 0);
    return group;
  }, {});
  const cards = rows.map((item) => `<article class="account-card"><span class="account-icon">${esc((item.nombre || "C")[0].toUpperCase())}</span><div class="account-main"><strong>${esc(item.nombre)}</strong><small>${esc(optionLabel(item.tipo))} · ${esc(relationLabel("propietario_id", item.propietario_id))}${item.institucion_id ? ` · ${esc(relationLabel("institucion_id", item.institucion_id))}` : ""}</small><span class="badge">${esc(optionLabel(item.estado || "ACTIVA"))}</span></div><div class="account-balance"><strong>${moneyFromMinor(item.saldoActualMinor ?? item.saldoInicialMinor, item.moneda)}</strong><small>${esc(item.moneda || "PEN")}</small></div><div class="account-actions"><button type="button" data-account-movements="${esc(item.id)}">Movimientos</button><button type="button" data-edit="cuentas" data-id="${esc(item.id)}">Editar</button><button type="button" class="danger" data-delete="cuentas" data-id="${esc(item.id)}">Eliminar</button></div></article>`).join("");
  const summary = Object.entries(totals).map(([code, value]) => `<article><span>Saldo total · ${esc(code)}</span><strong>${moneyFromMinor(value, code)}</strong><small>${active.filter((item) => (item.moneda || "PEN") === code).length} cuentas activas</small></article>`).join("");
  const clearHistory = state.movementAccountFilter ? `<button class="btn secondary" type="button" data-clear-movement-filter>Quitar filtro de cuenta</button>` : "";
  $("#content").innerHTML = `<section class="account-summary">${summary || `<article><span>Saldo total</span><strong>${money(0, currency)}</strong><small>Aún no tienes cuentas</small></article>`}</section><form class="account-filters panel" data-account-filter-form><input name="q" type="search" placeholder="Buscar cuenta, titular o institución" value="${esc(filters.q || "")}"><select name="tipo"><option value="">Todos los tipos</option>${OPTIONS.tipoCuenta.map((type) => `<option value="${type}" ${filters.tipo === type ? "selected" : ""}>${esc(optionLabel(type))}</option>`).join("")}</select><select name="moneda"><option value="">Todas las monedas</option>${OPTIONS.moneda.map((code) => `<option value="${code}" ${filters.moneda === code ? "selected" : ""}>${esc(optionLabel(code))}</option>`).join("")}</select><select name="estado"><option value="">Todos los estados</option><option value="ACTIVA" ${filters.estado === "ACTIVA" ? "selected" : ""}>Activa</option><option value="INACTIVA" ${filters.estado === "INACTIVA" ? "selected" : ""}>Inactiva</option></select><button class="btn secondary" type="submit">Filtrar</button><button class="btn secondary" type="button" data-account-clear>Limpiar</button>${clearHistory}</form><section class="account-list">${cards || `<p class="panel empty">No hay cuentas que coincidan con estos filtros.</p>`}</section>`;
}

function showDataError(error) {
  console.error(error);
  const needsIndex = error?.code === "failed-precondition";
  const indexUrl = needsIndex ? error?.message?.match(/https:\/\/console\.firebase\.google\.com\/\S+/)?.[0]?.replace(/[),.;]+$/, "") : null;
  const message = error?.code === "permission-denied" ? "Firestore bloqueó la solicitud. Revisa que firestore.rules esté publicado." : needsIndex ? "Firestore devolvió una condición previa fallida. Revisa el índice requerido y espera a que cualquier índice nuevo termine de crearse." : authError(error);
  const diagnostic = needsIndex ? indexUrl
    ? `<p><a class="link-button" href="${esc(indexUrl)}" target="_blank" rel="noopener noreferrer">Abrir índice requerido en Firebase Console</a></p>`
    : `<details><summary>Detalle técnico</summary><code>${esc(error?.message || "Sin detalle proporcionado")}</code></details>` : "";
  $("#content").innerHTML = `<section class="panel"><p class="empty">${esc(message)}</p>${diagnostic}</section>`;
}

function relationLabel(field, id) {
  if (!id) return "—";
  const source = field === "categoria_id" ? "categorias"
    : ["cuenta_id", "cuenta_origen_id", "cuenta_destino_id"].includes(field) ? "cuentas"
      : field === "tarjeta_id" ? "tarjetas"
        : field === "persona_id" ? "personas"
          : field === "propietario_id" ? "propietarios" : "instituciones";
  const row = (state.data[source] || []).find((item) => item.id === id);
  return row?.nombre || row?.email || "—";
}

function cellValue(entity, key, row) {
  const value = row[key];
  if (key === "comprobante") return row.attachment?.path ? firebaseStorageAvailable ? `<button class="link-button" data-open-receipt="${esc(row.attachment.path)}">${esc(row.attachment.name || "Abrir")}</button>` : `<span class="caption">No disponible (Storage desactivado)</span>` : "—";
  if (["categoria_id", "cuenta_id", "tarjeta_id", "persona_id", "propietario_id", "institucion_id", "cuenta_origen_id", "cuenta_destino_id"].includes(key)) return esc(relationLabel(key, value));
  if (["monto", "limite", "saldo_actual", "linea_credito", "utilizado", "monto_objetivo", "monto_actual", "monto_total", "monto_pagado", "monto_estimado"].includes(key)) return `<strong>${esc(money(value, row.moneda || "PEN"))}</strong>`;
  if (key === "estado" || key === "tipo" || key === "medio_pago") return `<span class="badge ${esc(String(value || "").toLowerCase())}">${esc(optionLabel(value))}</span>`;
  if (key === "mes" && String(value).length > 7) return esc(String(value).slice(0, 7));
  return esc(value || "—");
}

function renderPeople(rows) {
  if (!rows.length) return `<section class="people-empty"><div class="people-empty-mark" aria-hidden="true">＋</div><h2>Aún no hay personas</h2><p>Agrega a las personas de tu hogar para tener sus datos de contacto a mano.</p><button type="button" class="btn primary" data-new="personas">Agregar primera persona</button></section>`;
  const cards = rows.map((row) => {
    const name = row.nombre || "Persona sin nombre";
    const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("es");
    const color = /^#[\da-f]{3}(?:[\da-f]{3})?(?:[\da-f]{2})?$/i.test(row.color || "") ? row.color : "#315efb";
    const contact = [row.email ? `<a href="mailto:${esc(row.email)}">${esc(row.email)}</a>` : "", row.telefono ? `<a href="tel:${esc(String(row.telefono).replace(/[^+\d]/g, ""))}">${esc(row.telefono)}</a>` : ""].filter(Boolean);
    const birthdate = row.fecha_nacimiento ? `<span class="people-birthday"><span aria-hidden="true">🎂</span> ${esc(row.fecha_nacimiento)}</span>` : "";
    return `<article class="people-card"><div class="people-card-main"><span class="people-avatar" style="--person-color:${esc(color)}" aria-hidden="true">${esc(initials || "P")}</span><div class="people-identity"><h3>${esc(name)}</h3><span class="people-relation">${esc(optionLabel(row.relacion || "PERSONA"))}</span></div><div class="people-actions"><button type="button" data-edit="personas" data-id="${esc(row.id)}">Editar</button><button type="button" class="danger" data-delete="personas" data-id="${esc(row.id)}">Eliminar</button></div></div><div class="people-contact">${contact.length ? contact.map((item) => `<span class="people-contact-item">${item}</span>`).join("") : `<span class="people-no-contact">Sin datos de contacto</span>`}${birthdate}</div></article>`;
  }).join("");
  return `<section class="people-section"><div class="people-section-head"><div><span class="overline">TU HOGAR</span><h2>Personas</h2><p class="caption">${rows.length} ${rows.length === 1 ? "persona" : "personas"} en esta página</p></div><button type="button" class="btn primary" data-new="personas"><span aria-hidden="true">＋</span> Nueva persona</button></div><div class="people-grid">${cards}</div></section>`;
}

function renderEntity(entity) {
  const meta = META[entity];
  const rows = state.data[entity] || [];
  const fields = LIST_FIELDS[entity] || [];
  const filterable = ["movimientos", "transferencias", "pagosTarjeta"].includes(entity);
  const filters = filterable ? `<form class="filters panel" data-filter-form>${dateControlMarkup("startDate", state.filter.startDate, "date", false, "", "Desde")}${dateControlMarkup("endDate", state.filter.endDate, "date", false, "", "Hasta")}${entity === "movimientos" ? `<select name="tipo"><option value="">Todos los tipos</option>${OPTIONS.tipoMovimiento.map((value) => `<option value="${value}" ${state.filter.equals?.tipo === value ? "selected" : ""}>${esc(optionLabel(value))}</option>`).join("")}</select>${state.movementAccountFilter ? `<button class="btn secondary" type="button" data-clear-movement-filter>Quitar filtro de cuenta</button>` : ""}` : ""}<button class="btn secondary" type="submit">Filtrar</button><button class="btn secondary" type="button" data-clear-filter>Limpiar</button></form>` : "";
  const institutionRows = entity === "instituciones" ? [...BASE_INSTITUTIONS, ...(state.data.instituciones || []).filter((row) => !row.base)] : rows;
  const visibleRows = entity === "instituciones" ? institutionRows : rows;
  if (entity === "personas") {
    $("#content").innerHTML = renderPeople(visibleRows) + (state.entityHasMore ? `<div class="load-more"><button class="btn secondary" data-load-more>Cargar más</button></div>` : "");
    return;
  }
  const columns = fields.map((key) => `<th>${esc(fieldLabel(key))}</th>`).join("");
  const body = visibleRows.length ? visibleRows.map((row) => `<tr>${fields.map((key) => `<td${entity === "movimientos" ? ` data-label="${esc(fieldLabel(key))}"` : ""}>${cellValue(entity, key, row)}</td>`).join("")}<td class="actions"${entity === "movimientos" ? ` data-label="Acciones"` : ""}>${row.base ? `<span class="caption">Catálogo</span>` : `<button type="button" data-edit="${entity}" data-id="${esc(row.id)}">Editar</button><button type="button" class="danger" data-delete="${entity}" data-id="${esc(row.id)}">Eliminar</button>`}</td></tr>`).join("") : `<tr><td colspan="${fields.length + 1}" class="empty">Todavía no hay ${esc(meta.title.toLowerCase())}.</td></tr>`;
  const responsiveTableClass = entity === "movimientos" ? " movement-cards" : "";
  $("#content").innerHTML = `${filters}<section class="panel table-panel"><div class="section-head"><div><h2>${esc(meta.title)}</h2><p class="caption">Se muestran ${visibleRows.length} registros en esta página.</p></div></div><div class="table-scroll${responsiveTableClass}"><table><thead><tr>${columns}<th>Acciones</th></tr></thead><tbody>${body}</tbody></table></div></section>${state.entityHasMore ? `<div class="load-more"><button class="btn secondary" data-load-more>Cargar más</button></div>` : ""}`;
}

async function applyFilters(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  if (form.matches("[data-account-filter-form]")) {
    state.accountFilters = values;
    return renderAccounts();
  }
  state.filter = { startDate: values.startDate, endDate: values.endDate, equals: values.tipo ? { tipo: values.tipo } : {} };
  state.data[state.page] = [];
  state.entityCursor = null;
  await loadEntityPage(false);
}

async function loadReports(append) {
  pageLoading();
  const current = currentMonth();
  const start = `${shiftMonth(current, -11)}-01`;
  const end = monthBounds(current).end;
  try {
    const result = await listPage(state.user.uid, "movimientos", { limit: REPORT_LIMIT, cursor: append ? state.reportCursor : null, orderField: "fecha", direction: "desc", startDate: start, endDate: end, equals: { moneda: state.profile.currency || "PEN" } });
    state.reportRows = append ? [...state.reportRows, ...result.rows] : result.rows;
    state.reportCursor = result.cursor;
    state.reportHasMore = result.hasMore;
    renderReports();
  } catch (error) { showDataError(error); }
}

function renderReports() {
  const currency = state.profile.currency || "PEN";
  const grouped = aggregateByMonth(state.reportRows);
  const rows = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  const totals = rows.reduce((result, [, row]) => ({ incomeMinor: result.incomeMinor + row.incomeMinor, expenseMinor: result.expenseMinor + row.expenseMinor }), { incomeMinor: 0, expenseMinor: 0 });
  const html = rows.length ? rows.map(([month, row]) => `<tr><td><strong>${esc(month)}</strong></td><td class="positive">${moneyFromMinor(row.incomeMinor, currency)}</td><td class="negative">${moneyFromMinor(row.expenseMinor, currency)}</td><td><strong>${moneyFromMinor(row.incomeMinor - row.expenseMinor, currency)}</strong></td></tr>`).join("") : `<tr><td colspan="4" class="empty">Registra movimientos para generar el análisis.</td></tr>`;
  $("#content").innerHTML = `<section class="stats"><article class="stat-card"><span>INGRESOS · ÚLTIMOS 12 MESES</span><strong class="positive">${moneyFromMinor(totals.incomeMinor, currency)}</strong></article><article class="stat-card"><span>EGRESOS · ÚLTIMOS 12 MESES</span><strong class="negative">${moneyFromMinor(totals.expenseMinor, currency)}</strong></article><article class="stat-card"><span>BALANCE DEL MES</span><strong>${moneyFromMinor((grouped[currentMonth()]?.incomeMinor || 0) - (grouped[currentMonth()]?.expenseMinor || 0), currency)}</strong></article></section><section class="panel table-panel"><div class="section-head"><div><h2>Flujo mensual</h2><p class="caption">${esc(shiftMonth(currentMonth(), -11))} a ${esc(currentMonth())} · ${state.reportRows.length} movimientos consultados en ${esc(currency)}</p></div></div><div class="table-scroll"><table><thead><tr><th>Periodo</th><th>Ingresos</th><th>Egresos</th><th>Balance</th></tr></thead><tbody>${html}</tbody></table></div></section>${state.reportHasMore ? `<div class="load-more"><button class="btn secondary" data-load-report-more>Cargar más</button></div>` : ""}`;
}

function renderProfile() {
  $("#content").innerHTML = `<section class="panel profile-panel"><div class="section-head"><div><h2>Perfil</h2><p class="caption">Actualiza los datos de tu cuenta.</p></div></div><form data-profile-form class="form-grid"><label>Nombre<input name="displayName" required maxlength="120" value="${esc(state.profile.displayName || state.user.displayName || "")}"></label><label>Correo<input name="email" type="email" required value="${esc(state.user.email || "")}"></label><label>Moneda principal<select name="currency">${OPTIONS.moneda.map((currency) => `<option value="${currency}" ${(state.profile.currency || "PEN") === currency ? "selected" : ""}>${esc(optionLabel(currency))}</option>`).join("")}</select></label><label>Contraseña actual<input name="currentPassword" type="password" autocomplete="current-password" placeholder="Necesaria para cambiar correo o contraseña"></label><label>Nueva contraseña<input name="newPassword" type="password" minlength="8" autocomplete="new-password" placeholder="Déjala vacía si no vas a cambiarla"></label><div class="wide"><button class="btn primary" type="submit">Guardar perfil</button><button class="btn secondary" type="button" data-reset-password>Enviar enlace para restablecer contraseña</button></div></form></section>`;
}

async function saveProfile(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const changedEmail = values.email.trim() !== state.user.email;
  const changedPassword = Boolean(values.newPassword);
  try {
    if ((changedEmail || changedPassword) && !values.currentPassword) throw new Error("Escribe tu contraseña actual para confirmar el cambio de seguridad.");
    if (changedEmail || changedPassword) {
      const credential = services.authSdk.EmailAuthProvider.credential(state.user.email, values.currentPassword);
      await services.authSdk.reauthenticateWithCredential(state.user, credential);
    }
    if (changedEmail) await services.authSdk.verifyBeforeUpdateEmail(state.user, values.email.trim());
    if (changedPassword) await services.authSdk.updatePassword(state.user, values.newPassword);
    await services.authSdk.updateProfile(state.user, { displayName: values.displayName.trim() });
    await updateUserProfile(state.user, values);
    state.profile = await getProfile(state.user.uid);
    showApp();
    toast(changedEmail ? "Revisa tu correo para confirmar la nueva dirección." : "Perfil actualizado.");
    await renderProfile();
  } catch (error) { toast(authError(error)); }
}

function fieldLabel(field) {
  return ({ categoria_id: "Categoría", cuenta_id: "Cuenta", tarjeta_id: "Tarjeta", persona_id: "Persona", propietario_id: "Titular", institucion_id: "Institución", cuenta_origen_id: "Origen", cuenta_destino_id: "Destino", saldo_actual: "Saldo actual", linea_credito: "Línea", utilizado: "Utilizado", monto_objetivo: "Objetivo", monto_actual: "Ahorrado", monto_total: "Total", monto_pagado: "Pagado", monto_estimado: "Estimado", limite: "Límite", mes: "Mes", proxima_fecha: "Próximo pago", fecha_vencimiento: "Vencimiento", fecha_objetivo: "Fecha objetivo", numero_cuotas: "Cuotas", fecha_nacimiento: "Nacimiento", relacion: "Relación", medio_pago: "Forma de pago", origen_movimiento: "Origen", comprobante: "Comprobante" })[field] || field.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function optionLabel(value = "") {
  const labels = { PEN: "PEN · Sol peruano", USD: "USD · Dólar estadounidense", EUR: "EUR · Euro", GBP: "GBP · Libra esterlina", JPY: "JPY · Yen", CLP: "CLP · Peso chileno", COP: "COP · Peso colombiano", MXN: "MXN · Peso mexicano", BRL: "BRL · Real", PERSONA: "Persona", EMPRESA: "Empresa", COMPARTIDA: "Compartida", INGRESO: "Ingreso", GASTO: "Gasto", CREDITO: "Crédito", DEBITO: "Débito", PENDIENTE: "Pendiente", PAGADA: "Pagada", ACTIVA: "Activa", INACTIVA: "Inactiva", ARCHIVADA: "Archivada", ACTIVO: "Activo", PASIVO: "Pasivo", TITULAR: "Titular", PAREJA: "Pareja", HIJO: "Hijo/a", FAMILIAR: "Familiar", EFECTIVO: "Efectivo", BANCO: "Banco", YAPE: "Yape", PLIN: "Plin", TARJETA_DEBITO: "Tarjeta de débito", TARJETA_CREDITO: "Tarjeta de crédito", CUENTA_BANCARIA: "Cuenta bancaria", BILLETERA_DIGITAL: "Billetera digital", COOPERATIVA: "Cooperativa", FINANCIERA: "Financiera", OTRA: "Otra", OTRO: "Otro", SEMANAL: "Semanal", QUINCENAL: "Quincenal", MENSUAL: "Mensual", ANUAL: "Anual" };
  return labels[value] || String(value).toLowerCase().replaceAll("_", " ");
}

function getOptions(key, field) {
  if (OPTIONS[key]) return OPTIONS[key];
  if (key === "estadoCuenta") return ["ACTIVA", "INACTIVA", "ARCHIVADA"];
  if (key === "cuentas") return (state.data.cuentas || []).filter((row) => row.estado !== "ARCHIVADA");
  if (key === "tarjetas") return state.data.tarjetas || [];
  if (key === "personas") return state.data.personas || [];
  if (key === "propietarios") return (state.data.propietarios || []).filter((row) => row.estado !== "INACTIVO");
  if (key === "instituciones") return state.data.instituciones || BASE_INSTITUTIONS;
  if (key === "categorias") return (state.data.categorias || []).filter((row) => field !== "presupuestos" || row.tipo === "GASTO");
  return [];
}

function formFieldHTML(field, label, type, optionKey, optional, value, entity) {
  const optionalAttr = optional ? "" : "required";
  if (type === "select") {
    const options = getOptions(optionKey, entity);
    return `<label data-field="${field}">${esc(label)}<select name="${field}" ${optionalAttr}><option value="">Selecciona</option>${options.map((item) => {
      const key = typeof item === "string" ? item : item.id;
      const title = typeof item === "string" ? optionLabel(item) : `${item.nombre}${item.tipo ? ` · ${optionLabel(item.tipo)}` : ""}`;
      return `<option value="${esc(key)}" ${String(key) === String(value) ? "selected" : ""}>${esc(title)}</option>`;
    }).join("")}</select></label>`;
  }
  if (type === "relation") {
    const options = getOptions(optionKey, entity);
    const blank = optional ? `<option value="">Sin asignar</option>` : `<option value="">Selecciona</option>`;
    return `<label data-field="${field}">${esc(label)}<select name="${field}" ${optionalAttr}>${blank}${options.map((item) => `<option value="${esc(item.id)}" ${String(item.id) === String(value) ? "selected" : ""}>${esc(item.nombre || item.email || "")}${item.tipo ? ` · ${esc(optionLabel(item.tipo))}` : ""}</option>`).join("")}</select></label>`;
  }
  if (type === "textarea") return `<label class="wide" data-field="${field}">${esc(label)}<textarea name="${field}" ${optionalAttr}>${esc(value || "")}</textarea></label>`;
  let inputValue = value ?? "";
  if (type === "month" && inputValue) inputValue = String(inputValue).slice(0, 7);
  if (["date", "month"].includes(type) && !inputValue) inputValue = type === "month" ? currentMonth() : todayISO();
  if (["date", "month"].includes(type)) return `<div class="field-control" data-field="${field}"><label for="date-${esc(field)}">${esc(label)}</label>${dateControlMarkup(field, inputValue, type, !optional, `date-${field}`)}</div>`;
  const step = type === "money" ? 'step="0.01" min="0.01" inputmode="decimal"' : type === "number" ? 'step="1" min="0" inputmode="numeric"' : "";
  return `<label data-field="${field}">${esc(label)}<input name="${field}" type="${type === "money" ? "number" : type}" ${step} value="${esc(inputValue)}" ${optionalAttr}></label>`;
}

function openForm(entity, row = null, preset = {}) {
  if (!FIELDS[entity]) return;
  state.editing = { entity, id: row?.id || null, row };
  $("#dialog-title").textContent = `${row ? "Editar" : "Nuevo"} ${META[entity].singular}`;
  const defaults = {
    moneda: state.profile.currency || "PEN", fecha: todayISO(), fecha_saldo_inicial: todayISO(), mes: currentMonth(),
    saldo_inicial: 0, saldo_inicial_usado: 0, monto_pagado: 0, monto_actual: 0, numero_cuotas: 1,
    tipo: entity === "propietarios" ? "PERSONA" : entity === "tarjetas" ? "CREDITO" : "GASTO",
    medio_pago: "CUENTA_BANCARIA", estado: "ACTIVA", estado_deuda: "PENDIENTE",
  };
  const fields = FIELDS[entity].map(([name, label, type, options, optional]) => {
    let value = row?.[name] ?? preset[name] ?? defaults[name] ?? "";
    if (name === "institucion_id" && row?.institucion_id?.startsWith("base-")) value = row.institucion_id;
    return formFieldHTML(name, label, type, options, optional, value, entity);
  }).join("");
  const attachment = entity === "movimientos" ? firebaseStorageAvailable ? `<label class="wide">Comprobante (imagen o PDF, máximo 10 MB)<input id="receipt-file" name="comprobanteFile" type="file" accept="image/*,application/pdf"><small>${row?.attachment?.name ? `Actual: ${esc(row.attachment.name)}. Al elegir otro se reemplazará.` : "El archivo será privado y accesible solo desde tu cuenta."}</small></label>${row?.attachment?.path ? `<label class="wide"><span><input name="removeAttachment" type="checkbox" value="1"> Quitar comprobante actual</span></label>` : ""}` : `<p class="field-help wide">Comprobantes temporalmente no disponibles: Firebase Storage aún no está habilitado. Puedes guardar el movimiento sin adjunto.</p>` : "";
  $("#form-fields").innerHTML = `<div id="flow-guidance" class="flow-guidance wide"></div>${fields}${attachment}`;
  updateFormFlow();
  $("#record-dialog").showModal();
}

function updateFormFlow(target) {
  const form = $("#record-form");
  const entity = state.editing?.entity;
  const hide = (name, shouldHide) => {
    const field = form.querySelector(`[data-field="${name}"]`);
    if (!field) return;
    field.hidden = shouldHide;
    const control = field.querySelector("input,select,textarea");
    if (control) control.disabled = shouldHide;
  };
  const guidance = $("#flow-guidance");
  if (entity === "movimientos") {
    const method = form.elements.medio_pago?.value || "";
    const credit = method === "TARJETA_CREDITO";
    const debit = method === "TARJETA_DEBITO";
    hide("cuenta_id", credit || debit);
    hide("tarjeta_id", !credit && !debit);
    hide("numero_cuotas", !credit);
    if (target?.name === "medio_pago") {
      form.elements.tarjeta_id.value = "";
      form.elements.cuenta_id.value = "";
    }
    guidance.textContent = credit ? "La compra aumenta la deuda de la tarjeta; registra el pago como una operación aparte." : debit ? "El gasto se descuenta de la cuenta vinculada a la tarjeta de débito." : "Selecciona la cuenta desde donde sale o ingresa el dinero.";
  } else if (entity === "tarjetas") {
    const debit = form.elements.tipo?.value === "DEBITO";
    hide("cuenta_id", !debit);
    ["linea_credito", "saldo_inicial_usado", "dia_cierre", "dia_pago", "tasa_interes_anual"].forEach((field) => hide(field, debit));
    guidance.textContent = debit ? "Vincula la cuenta cuyo saldo se descontará al usar esta tarjeta." : "Registra límite, saldo utilizado y ciclo de pago de la tarjeta.";
  } else if (entity === "cuentas") {
    const type = form.elements.tipo?.value || "";
    const requiresInstitution = ["BANCO", "YAPE", "PLIN", "TARJETA_DE_DEBITO", "TARJETA_DE_CREDITO", "BILLETERA_DIGITAL"].includes(type);
    hide("institucion_id", !requiresInstitution);
    guidance.textContent = type ? `${optionLabel(type)} se organizará como ${ACCOUNT_NATURE[type] || "ACTIVO"}.` : "Asigna un titular y selecciona el tipo de cuenta.";
  } else if (guidance) guidance.hidden = true;
}

function readForm(entity, row) {
  const formData = new FormData($("#record-form"));
  const value = {};
  for (const [name, label, type] of FIELDS[entity]) {
    const raw = formData.get(name);
    if (type === "number") value[name] = raw === "" ? null : Number(raw);
    else if (type === "money") value[name] = raw === "" ? 0 : Number(raw);
    else if (type === "relation") value[name] = raw || null;
    else value[name] = typeof raw === "string" ? raw.trim() : raw;
  }
  if (row?.createdAt) value.createdAt = row.createdAt;
  if (row?.attachment) value.attachment = row.attachment;
  if (entity === "presupuestos") value.mes = `${value.mes}-01`;
  return value;
}

function validateRecord(entity, value, row) {
  if (["personas", "propietarios", "instituciones", "cuentas", "tarjetas", "categorias", "metas", "recurrentes"].includes(entity) && !value.nombre) throw new Error("Escribe un nombre para este registro.");
  if (entity === "instituciones" && !value.pais) value.pais = "PE";
  const moneyByEntity = { cuentas: ["saldo_inicial"], tarjetas: ["linea_credito", "saldo_inicial_usado"], presupuestos: ["limite"], metas: ["monto_objetivo", "monto_actual"], deudas: ["monto_total", "monto_pagado"], recurrentes: ["monto_estimado"] };
  for (const field of moneyByEntity[entity] || []) if (value[field] != null && (!Number.isFinite(value[field]) || value[field] < 0)) throw new Error("Los importes deben ser cero o positivos.");
  if (entity === "movimientos") {
    const credit = value.medio_pago === "TARJETA_CREDITO";
    const debit = value.medio_pago === "TARJETA_DEBITO";
    if (value.monto <= 0) throw new Error("El importe debe ser mayor que cero.");
    if (!value.categoria_id || !state.data.categorias.some((item) => item.id === value.categoria_id)) throw new Error("Selecciona una categoría válida.");
    if (state.data.categorias.find((item) => item.id === value.categoria_id)?.tipo !== value.tipo) throw new Error("La categoría debe corresponder al tipo de movimiento.");
    if ((credit || debit) && value.tipo !== "GASTO") throw new Error("Las tarjetas solo se pueden usar para gastos.");
    if (credit || debit) {
      const card = state.data.tarjetas.find((item) => item.id === value.tarjeta_id);
      if (!card || card.tipo !== (credit ? "CREDITO" : "DEBITO")) throw new Error(`Selecciona una tarjeta de ${credit ? "crédito" : "débito"}.`);
      if (debit) {
        if (!card.cuenta_id) throw new Error("La tarjeta de débito necesita una cuenta vinculada.");
        value.cuenta_id = card.cuenta_id;
      } else value.cuenta_id = null;
      if (!credit) value.numero_cuotas = 1;
    } else if (!value.cuenta_id) throw new Error("Selecciona una cuenta.");
    if (value.cuenta_id) {
      const account = state.data.cuentas.find((item) => item.id === value.cuenta_id);
      if (!account || account.moneda !== value.moneda) throw new Error("La cuenta y el movimiento deben usar la misma moneda.");
    }
    if (value.tarjeta_id) {
      const card = state.data.tarjetas.find((item) => item.id === value.tarjeta_id);
      if (!card || card.moneda !== value.moneda) throw new Error("La tarjeta y el movimiento deben usar la misma moneda.");
    }
  }
  if (entity === "transferencias") {
    if (!value.cuenta_origen_id || !value.cuenta_destino_id || value.cuenta_origen_id === value.cuenta_destino_id) throw new Error("Selecciona dos cuentas distintas.");
    const from = state.data.cuentas.find((item) => item.id === value.cuenta_origen_id);
    const to = state.data.cuentas.find((item) => item.id === value.cuenta_destino_id);
    if (!from || !to || from.moneda !== to.moneda || from.moneda !== value.moneda) throw new Error("Origen, destino e importe deben usar la misma moneda.");
    if (value.monto <= 0) throw new Error("El importe debe ser mayor que cero.");
  }
  if (entity === "pagosTarjeta") {
    const card = state.data.tarjetas.find((item) => item.id === value.tarjeta_id);
    const account = state.data.cuentas.find((item) => item.id === value.cuenta_id);
    if (!card || card.tipo !== "CREDITO") throw new Error("Selecciona una tarjeta de crédito.");
    if (!account) throw new Error("Selecciona la cuenta de pago.");
    if (card.moneda !== value.moneda || account.moneda !== value.moneda) throw new Error("Tarjeta, cuenta e importe deben usar la misma moneda.");
    if (value.monto <= 0) throw new Error("El importe debe ser mayor que cero.");
  }
  if (entity === "tarjetas") {
    if (value.tipo === "DEBITO" && !value.cuenta_id) throw new Error("Vincula una cuenta a la tarjeta de débito.");
    if (value.tipo === "CREDITO" && (!value.linea_credito || !value.dia_cierre || !value.dia_pago)) throw new Error("Completa la línea de crédito, día de cierre y día de pago.");
  }
  if (entity === "deudas" && value.monto_pagado > value.monto_total) throw new Error("El importe pagado no puede superar la deuda total.");
  if (entity === "metas" && value.monto_actual > value.monto_objetivo) throw new Error("El ahorro actual no puede superar la meta objetivo.");
  if (entity === "cuentas" && !value.propietario_id) throw new Error("Selecciona un titular.");
  if (entity === "presupuestos" && value.limite <= 0) throw new Error("El límite debe ser mayor que cero.");
}

async function saveForm(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") { $("#record-dialog").close(); return; }
  const { entity, row, id } = state.editing;
  const button = $("#save-record");
  button.disabled = true;
  button.textContent = "Guardando…";
  let uploaded = null;
  try {
    const value = readForm(entity, row);
    validateRecord(entity, value, row);
    if (entity === "cuentas") {
      value.naturaleza = ACCOUNT_NATURE[value.tipo] || "ACTIVO";
      value.estado ||= "ACTIVA";
      value.saldo_inicial = Math.max(0, value.saldo_inicial);
      value.moneda ||= "PEN";
      if (!id) value.saldo_actual = value.saldo_inicial;
      if (!FIELDS.cuentas.some(([name]) => name === "institucion_id") || !["BANCO", "YAPE", "PLIN", "TARJETA_DE_DEBITO", "TARJETA_DE_CREDITO", "BILLETERA_DIGITAL"].includes(value.tipo)) value.institucion_id = null;
    }
    if (entity === "tarjetas") {
      if (value.tipo === "DEBITO") {
        value.linea_credito = null; value.saldo_inicial_usado = 0; value.dia_cierre = null; value.dia_pago = null; value.tasa_interes_anual = 0;
      } else value.cuenta_id = null;
      if (!id) value.utilizado = Number(value.saldo_inicial_usado || 0);
    }
    if (entity === "movimientos") {
      value.numero_cuotas = Number(value.numero_cuotas || 1);
      if (value.numero_cuotas > 1 && value.medio_pago !== "TARJETA_CREDITO") throw new Error("Las cuotas solo están disponibles para tarjeta de crédito.");
      value.comprobanteFile = $("#receipt-file")?.files?.[0] || null;
      if (formDataChecked("removeAttachment")) value.attachment = null;
      const movementId = id || newId();
      if (value.comprobanteFile) uploaded = await uploadReceipt(state.user.uid, movementId, value.comprobanteFile);
      if (uploaded) value.attachment = uploaded;
      delete value.comprobanteFile;
      await saveMovement(state.user.uid, value, movementId, row);
      if (uploaded && row?.attachment?.path && row.attachment.path !== uploaded.path) await deleteReceipt(row.attachment.path).catch(() => {});
      if (row?.attachment?.path && value.attachment === null) await deleteReceipt(row.attachment.path).catch(() => {});
    } else if (["transferencias", "pagosTarjeta"].includes(entity)) {
      const docId = id || newId();
      await saveLedgerEntry(state.user.uid, entity, value, docId, row);
    } else {
      await saveDocument(state.user.uid, entity, value, id);
    }
    $("#record-dialog").close();
    toast("Registro guardado.");
    await loadReferenceData();
    if (entity === "movimientos" && state.page === "resumen") await renderDashboard();
    else if (state.page === "flujo" || state.page === "reportes") await loadReports(false);
    else await loadEntityPage(false);
  } catch (error) {
    if (uploaded?.path) await deleteReceipt(uploaded.path).catch(() => {});
    toast(authError(error));
  } finally {
    button.disabled = false;
    button.textContent = "Guardar";
  }
}

function formDataChecked(name) { return Boolean($("#record-form [name='" + name + "']")?.checked); }

async function contentClick(event) {
  const add = event.target.closest("[data-new]");
  const edit = event.target.closest("[data-edit]");
  const remove = event.target.closest("[data-delete]");
  if (add) return openForm(add.dataset.new, null, add.dataset.type ? { tipo: add.dataset.type } : {});
  if (edit) return openForm(edit.dataset.edit, (state.data[edit.dataset.edit] || []).find((item) => item.id === edit.dataset.id));
  if (remove) return deleteRow(remove.dataset.delete, remove.dataset.id);
  if (event.target.closest("[data-account-clear]")) { state.accountFilters = {}; return renderAccounts(); }
  const accountMovements = event.target.closest("[data-account-movements]");
  if (accountMovements) {
    state.movementAccountFilter = accountMovements.dataset.accountMovements;
    if (state.page === "movimientos") return loadEntityPage(false);
    location.hash = "#movimientos";
    return;
  }
  if (event.target.closest("[data-clear-movement-filter]")) {
    state.movementAccountFilter = null;
    state.filter = {};
    return loadEntityPage(false);
  }
  if (event.target.closest("[data-load-more]")) return loadEntityPage(true);
  if (event.target.closest("[data-load-report-more]")) return loadReports(true);
  const receipt = event.target.closest("[data-open-receipt]");
  if (receipt) {
    try { await openReceipt(receipt.dataset.openReceipt); }
    catch (error) { toast(authError(error)); }
  }
  if (event.target.closest("[data-clear-filter]")) {
    state.filter = {};
    state.data[state.page] = [];
    state.entityCursor = null;
    await loadEntityPage(false);
  }
  if (event.target.closest("[data-reset-password]")) await resetPasswordForSignedInUser();
}

async function deleteRow(entity, id) {
  const row = (state.data[entity] || []).find((item) => item.id === id);
  if (!row || !confirm("¿Eliminar este registro? Esta acción no se puede deshacer.")) return;
  try {
    let receiptCleanupFailed = false;
    if (["movimientos", "transferencias", "pagosTarjeta"].includes(entity)) {
      await deleteLedgerEntry(state.user.uid, entity, id, row);
      if (entity === "movimientos" && row.attachment?.path) await deleteReceipt(row.attachment.path).catch(() => { receiptCleanupFailed = true; });
    } else await removeDocument(state.user.uid, entity, id);
    toast(receiptCleanupFailed ? "Movimiento eliminado; no se pudo borrar el archivo adjunto." : "Registro eliminado.");
    await loadReferenceData();
    await loadEntityPage(false);
  } catch (error) { toast(authError(error)); }
}

async function resetPasswordForSignedInUser() {
  if (!state.user.email) { toast("Esta cuenta no tiene correo configurado."); return; }
  try {
    await services.authSdk.sendPasswordResetEmail(services.auth, state.user.email);
    toast("Enviamos un enlace para restablecer la contraseña.");
  } catch (error) { toast(authError(error)); }
}

async function boot() {
  bind();
  if (!firebaseReady) {
    showAuth("Firebase aún no está configurado. Copia los seis valores de Firebase Console a firebase-config.js y vuelve a cargar la página.");
    return;
  }
  try {
    services = await getFirebaseServices();
    services.authSdk.onAuthStateChanged(services.auth, async (user) => {
      if (!user) {
        state.user = null;
        state.data = {};
        showAuth();
        return;
      }
      try { await onSignedIn(user); }
      catch (error) { showDataError(error); }
    });
  } catch (error) {
    console.error(error);
    showAuth("No se pudo inicializar Firebase. Revisa firebase-config.js y la configuración del proyecto.");
  }
}

boot();
