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
  ["PRINCIPAL"], ["resumen", "dashboard", "Resumen"], ["movimientos", "transfer", "Movimientos"],
  ["operaciones"], ["transferencias", "transfer", "Transferencias"], ["pagosTarjeta", "card", "Pagos de tarjetas"],
  ["GESTIÓN"], ["cuentas", "wallet", "Cuentas"], ["personas", "users", "Personas"],
  ["propietarios", "users", "Titulares"], ["instituciones", "wallet", "Instituciones"], ["tarjetas", "card", "Tarjetas"],
  ["categorias", "tag", "Categorías"], ["presupuestos", "budget", "Presupuestos"],
  ["PLANIFICACIÓN"], ["metas", "target", "Metas de ahorro"], ["deudas", "debt", "Deudas"],
  ["recurrentes", "repeat", "Gastos recurrentes"], ["flujo", "calendar", "Flujo mensual"], ["reportes", "chart", "Reportes"],
  ["CUENTA"], ["perfil", "users", "Mi perfil"],
];

const META = {
  personas: { title: "Personas", eye: "PERFILES DEL HOGAR", singular: "persona" },
  propietarios: { title: "Titulares", eye: "PERSONAS, EMPRESAS Y CUENTAS COMPARTIDAS", singular: "titular" },
  instituciones: { title: "Instituciones financieras", eye: "BANCOS Y ENTIDADES", singular: "institución" },
  cuentas: { title: "Cuentas", eye: "TU DINERO DISPONIBLE", singular: "cuenta" },
  tarjetas: { title: "Tarjetas", eye: "CRÉDITO Y PAGOS", singular: "tarjeta" },
  categorias: { title: "Categorías", eye: "ORGANIZACIÓN", singular: "categoría" },
  movimientos: { title: "Movimientos", eye: "INGRESOS Y EGRESOS", singular: "movimiento" },
  transferencias: { title: "Transferencias", eye: "ENTRE TUS CUENTAS", singular: "transferencia" },
  pagosTarjeta: { title: "Pagos de tarjetas", eye: "PAGOS DE DEUDA", singular: "pago de tarjeta" },
  presupuestos: { title: "Presupuestos", eye: "CONTROL MENSUAL", singular: "presupuesto" },
  metas: { title: "Metas de ahorro", eye: "PLANIFICACIÓN", singular: "meta" },
  deudas: { title: "Deudas", eye: "COMPROMISOS", singular: "deuda" },
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
  accountFilters: {}, movementAccountFilter: null,
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

function navHTML() {
  return NAV.map((item) => item.length === 1
    ? `<small>${esc(item[0])}</small>`
    : `<a href="#${item[0]}" data-page="${item[0]}"><span class="nav-icon"><svg aria-hidden="true"><use href="#i-${item[1]}"></use></svg></span>${esc(item[2])}</a>`).join("");
}

function bind() {
  $("#navigation").innerHTML = navHTML();
  $("#today").textContent = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: APP_TIME_ZONE }).format(new Date());
  window.addEventListener("hashchange", () => void route());
  $("#auth-form").addEventListener("submit", submitAuth);
  $("#auth-toggle").addEventListener("click", toggleAuth);
  $("#forgot-password").addEventListener("click", resetPassword);
  $("#logout").addEventListener("click", () => services.authSdk.signOut(services.auth));
  $("#add-main").addEventListener("click", () => openForm(state.page));
  $("#content").addEventListener("click", (event) => void contentClick(event));
  $("#content").addEventListener("submit", (event) => {
    if (event.target.matches("[data-filter-form]")) { event.preventDefault(); void applyFilters(event.target); }
    if (event.target.matches("[data-account-filter-form]")) { event.preventDefault(); void applyFilters(event.target); }
    if (event.target.matches("[data-profile-form]")) { event.preventDefault(); void saveProfile(event.target); }
  });
  $("#record-form").addEventListener("submit", (event) => void saveForm(event));
  $("#record-form").addEventListener("change", (event) => updateFormFlow(event.target));
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
  document.querySelectorAll("#navigation a").forEach((link) => link.classList.toggle("active", link.dataset.page === state.page));
  const info = META[state.page] || { title: state.page === "perfil" ? "Mi perfil" : state.page === "flujo" ? "Flujo mensual" : state.page === "reportes" ? "Reportes" : "Tu dinero, en contexto", eye: "PANEL FINANCIERO" };
  $("#page-title").textContent = info.title;
  $("#page-eyebrow").textContent = info.eye;
  $("#add-main").classList.toggle("hidden", !FIELDS[state.page]);
  state.entityCursor = null;
  state.entityHasMore = false;
  if (state.page === "resumen") return renderDashboard();
  if (state.page === "perfil") return renderProfile();
  if (["flujo", "reportes"].includes(state.page)) return loadReports(false);
  if (state.page === "cuentas") return renderAccounts();
  return loadEntityPage(false);
}

function pageLoading(message = "Cargando…") {
  $("#content").innerHTML = `<section class="panel"><p class="empty">${esc(message)}</p></section>`;
}

async function renderDashboard() {
  pageLoading();
  try {
    const { start, end } = monthBounds(currentMonth());
    const [totals, recent, accountBalances, budgetPage, goalPage, debtPage] = await Promise.all([
      monthTotals(state.user.uid, start, end, state.profile.currency || "PEN"),
      listPage(state.user.uid, "movimientos", { limit: 100, orderField: "fecha", direction: "desc", startDate: start, endDate: end, equals: { moneda: state.profile.currency || "PEN" } }),
      Promise.resolve(state.data.cuentas || []),
      listPage(state.user.uid, "presupuestos", { limit: 100, orderField: "mes", direction: "desc", equals: { mes: `${currentMonth()}-01`, moneda: state.profile.currency || "PEN" } }),
      listPage(state.user.uid, "metas", { limit: 4, orderField: "createdAt", direction: "desc" }),
      listPage(state.user.uid, "deudas", { limit: 100, orderField: "createdAt", direction: "desc" }),
    ]);
    const currency = state.profile.currency || "PEN";
    const income = fromMinorUnits(totals.incomeMinor, currency);
    const expense = fromMinorUnits(totals.expenseMinor, currency);
    const balance = income - expense;
    const activeAccounts = accountBalances.filter((item) => item.estado !== "ARCHIVADA");
    const accounts = activeAccounts.filter((item) => (item.moneda || "PEN") === currency).reduce((sum, item) => sum + fromMinorUnits(Number(item.saldoActualMinor ?? item.saldoInicialMinor ?? 0), currency), 0);
    const rate = income ? Math.round((balance / income) * 100) : 0;
    const monthExpenses = recent.rows.filter((movement) => movement.tipo === "GASTO");
    const categoryTotals = monthExpenses.reduce((acc, movement) => {
      acc[movement.categoria_id] = (acc[movement.categoria_id] || 0) + Number(movement.montoMinor || 0);
      return acc;
    }, {});
    const topCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const debtByCurrency = debtPage.rows.reduce((groups, debt) => {
      const code = debt.moneda || "PEN";
      groups[code] = (groups[code] || 0) + Math.max(0, Number(debt.montoTotalMinor || 0) - Number(debt.montoPagadoMinor || 0));
      return groups;
    }, {});
    const budgets = await Promise.all(budgetPage.rows.map(async (budget) => ({
      ...budget,
      spentMinor: await categoryExpenseTotal(state.user.uid, budget.categoria_id, start, end, currency),
    })));
    const categoryName = (id) => state.data.categorias.find((item) => item.id === id)?.nombre || "Sin categoría";
    $("#content").innerHTML = `
      <section class="summary-grid">
        <article class="hero-card"><div class="hero-head"><div><span class="overline">Posición actual</span><h2>Disponible en tus cuentas</h2></div><span class="date-chip">${esc(currentMonth())}</span></div>
          <div class="main-balance"><small>${esc(CURRENCY_SYMBOLS[currency] || currency)}</small>${accounts.toLocaleString("es-PE", { minimumFractionDigits: ["JPY", "CLP", "COP"].includes(currency) ? 0 : 2, maximumFractionDigits: ["JPY", "CLP", "COP"].includes(currency) ? 0 : 2 })}</div>
          <p class="caption">Saldo de ${activeAccounts.filter((item) => (item.moneda || "PEN") === currency).length} cuentas en ${esc(currency)}. Otras monedas se consultan en Cuentas.</p>
          <div class="cashflow"><div><span>INGRESOS DEL MES</span><strong class="positive">+ ${money(income)}</strong></div><div><span>EGRESOS DEL MES</span><strong class="negative">− ${money(expense)}</strong></div><div><span>BALANCE MENSUAL</span><strong class="${balance >= 0 ? "positive" : "negative"}">${money(balance)}</strong></div></div>
        </article>
        <aside class="insight-card"><p class="eyebrow">LECTURA DEL MES</p><h2>${income ? `Conservaste el ${rate}% de tus ingresos.` : "Empieza registrando un movimiento."}</h2><p>${balance >= 0 ? "Tu balance mensual es positivo." : "Tus egresos superaron lo ingresado."}</p><div class="stat-card"><span>DEUDA PENDIENTE</span>${Object.entries(debtByCurrency).length ? Object.entries(debtByCurrency).map(([code, amount]) => `<strong>${moneyFromMinor(amount, code)}</strong>`).join("") : `<strong>${money(0, currency)}</strong>`}</div></aside>
      </section>
      <section class="dashboard-columns"><article class="panel"><div class="section-head"><div><h2>Movimientos recientes</h2><p class="caption">${esc(currentMonth())} · hasta 100 registros para el resumen</p></div><a class="link-button" href="#movimientos">Ver movimientos</a></div>${recent.rows.slice(0, 6).map((item) => `<div class="transaction-row"><span class="transaction-icon">${item.tipo === "INGRESO" ? "↗" : "↘"}</span><span class="transaction-info"><strong>${esc(item.descripcion || categoryName(item.categoria_id))}</strong><small>${esc(item.fecha)} · ${esc(categoryName(item.categoria_id))}</small></span><strong class="amount ${item.tipo === "INGRESO" ? "positive" : "negative"}">${item.tipo === "INGRESO" ? "+" : "−"}${moneyFromMinor(item.montoMinor, item.moneda)}</strong></div>`).join("") || `<p class="empty">Aún no tienes movimientos este mes.</p>`}</article>
        <article class="panel"><div class="section-head"><div><h2>Gastos por categoría</h2><p class="caption">Este mes, en tus registros recientes</p></div></div>${topCategories.map(([id, amount]) => `<div class="category-row"><div><span>${esc(categoryName(id))}</span><strong>${moneyFromMinor(amount)}</strong></div><progress max="${Math.max(...topCategories.map(([, total]) => total), 1)}" value="${amount}"></progress></div>`).join("") || `<p class="empty">Registra gastos para ver el análisis.</p>`}</article></section>
      ${budgets.length ? `<section class="panel"><div class="section-head"><div><h2>Presupuestos del mes</h2></div><a class="link-button" href="#presupuestos">Gestionar</a></div>${budgets.map((item) => `<div class="category-row"><div><span>${esc(categoryName(item.categoria_id))}</span><strong>${moneyFromMinor(item.spentMinor)} / ${moneyFromMinor(item.limiteMinor)}</strong></div><progress max="${Math.max(item.limiteMinor, 1)}" value="${Math.min(item.spentMinor, item.limiteMinor)}"></progress></div>`).join("")}</section>` : ""}
      ${goalPage.rows.length ? `<section class="panel"><div class="section-head"><h2>Metas de ahorro</h2><a class="link-button" href="#metas">Ver metas</a></div>${goalPage.rows.map((goal) => `<div class="category-row"><div><span>${esc(goal.nombre)}</span><strong>${money(goal.monto_actual, goal.moneda)} / ${money(goal.monto_objetivo, goal.moneda)}</strong></div><progress max="${Math.max(Number(goal.monto_objetivo), 1)}" value="${Math.min(Number(goal.monto_actual), Number(goal.monto_objetivo))}"></progress></div>`).join("")}</section>` : ""}
      ${recent.hasMore ? `<p class="caption">El resumen usa agregados completos para ingresos y egresos. La lista y el gráfico muestran hasta 100 movimientos del mes.</p>` : ""}`;
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

function renderEntity(entity) {
  const meta = META[entity];
  const rows = state.data[entity] || [];
  const fields = LIST_FIELDS[entity] || [];
  const filterable = ["movimientos", "transferencias", "pagosTarjeta"].includes(entity);
  const filters = filterable ? `<form class="filters panel" data-filter-form><input name="startDate" type="date" aria-label="Desde" value="${esc(state.filter.startDate || "")}"><input name="endDate" type="date" aria-label="Hasta" value="${esc(state.filter.endDate || "")}">${entity === "movimientos" ? `<select name="tipo"><option value="">Todos los tipos</option>${OPTIONS.tipoMovimiento.map((value) => `<option value="${value}" ${state.filter.equals?.tipo === value ? "selected" : ""}>${esc(optionLabel(value))}</option>`).join("")}</select>${state.movementAccountFilter ? `<button class="btn secondary" type="button" data-clear-movement-filter>Quitar filtro de cuenta</button>` : ""}` : ""}<button class="btn secondary" type="submit">Filtrar</button><button class="btn secondary" type="button" data-clear-filter>Limpiar</button></form>` : "";
  const institutionRows = entity === "instituciones" ? [...BASE_INSTITUTIONS, ...(state.data.instituciones || []).filter((row) => !row.base)] : rows;
  const visibleRows = entity === "instituciones" ? institutionRows : rows;
  const columns = fields.map((key) => `<th>${esc(fieldLabel(key))}</th>`).join("");
  const body = visibleRows.length ? visibleRows.map((row) => `<tr>${fields.map((key) => `<td>${cellValue(entity, key, row)}</td>`).join("")}<td class="actions">${row.base ? `<span class="caption">Catálogo</span>` : `<button type="button" data-edit="${entity}" data-id="${esc(row.id)}">Editar</button><button type="button" class="danger" data-delete="${entity}" data-id="${esc(row.id)}">Eliminar</button>`}</td></tr>`).join("") : `<tr><td colspan="${fields.length + 1}" class="empty">Todavía no hay ${esc(meta.title.toLowerCase())}.</td></tr>`;
  $("#content").innerHTML = `${filters}<section class="panel table-panel"><div class="section-head"><div><h2>${esc(meta.title)}</h2><p class="caption">Se muestran ${visibleRows.length} registros en esta página.</p></div></div><div class="table-scroll"><table><thead><tr>${columns}<th>Acciones</th></tr></thead><tbody>${body}</tbody></table></div></section>${state.entityHasMore ? `<div class="load-more"><button class="btn secondary" data-load-more>Cargar más</button></div>` : ""}`;
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
