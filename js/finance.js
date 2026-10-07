export const APP_TIME_ZONE = "America/Lima";

export function dateInAppTimeZone(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (kind) => parts.find((part) => part.type === kind)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function monthBounds(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${monthKey}-01`, end: `${monthKey}-${String(endDay).padStart(2, "0")}` };
}

export function shiftMonth(monthKey, offset) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currencyDigits(currency = "PEN") {
  return ["JPY", "CLP", "COP"].includes(currency) ? 0 : 2;
}

export function toMinorUnits(amount, currency = "PEN") {
  const value = Number(amount);
  if (!Number.isFinite(value)) throw new TypeError("El importe no es válido.");
  const factor = 10 ** currencyDigits(currency);
  return Math.round((value + Number.EPSILON) * factor);
}

export function fromMinorUnits(amount, currency = "PEN") {
  return Number(amount || 0) / (10 ** currencyDigits(currency));
}

export function movementDelta({ amountMinor, type, paymentMethod, accountId }) {
  if (!accountId || ["TARJETA_CREDITO", "TARJETA_DEBITO"].includes(paymentMethod)) return 0;
  return type === "INGRESO" ? amountMinor : -amountMinor;
}

export function remainingDebt(totalMinor, paidMinor) {
  return Math.max(0, Number(totalMinor || 0) - Number(paidMinor || 0));
}

export function cardUtilization(usedMinor, limitMinor) {
  if (!limitMinor || limitMinor <= 0) return 0;
  return Math.min(100, Math.round((usedMinor / limitMinor) * 100));
}

export function aggregateByMonth(movements) {
  return movements.reduce((result, movement) => {
    const month = String(movement.fecha || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return result;
    result[month] ??= { incomeMinor: 0, expenseMinor: 0 };
    const key = movement.tipo === "INGRESO" ? "incomeMinor" : "expenseMinor";
    result[month][key] += Number(movement.montoMinor || 0);
    return result;
  }, {});
}
