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
  const minor = Math.round((value + Number.EPSILON) * factor);
  if (!Number.isSafeInteger(minor)) throw new RangeError("El importe supera el rango monetario seguro.");
  return minor;
}

export function fromMinorUnits(amount, currency = "PEN") {
  return Number(amount || 0) / (10 ** currencyDigits(currency));
}

export function movementDelta({ amountMinor, type, paymentMethod, accountId }) {
  if (!accountId || (type === "GASTO" && paymentMethod === "TARJETA_CREDITO")) return 0;
  return type === "INGRESO" ? amountMinor : -amountMinor;
}

export function resolveMovementAccountId({ accountId, paymentMethod, cardAccountId }) {
  return accountId || (paymentMethod === "TARJETA_DEBITO" ? cardAccountId : null) || null;
}

export function cashFlowDelta({ amountMinor, type, paymentMethod = "", operationType = "MOVIMIENTO" }) {
  if (operationType === "TRANSFERENCIA") return 0;
  if (operationType === "PAGO_TARJETA") return -Math.abs(Number(amountMinor || 0));
  if (type === "GASTO" && paymentMethod === "TARJETA_CREDITO") return 0;
  return type === "INGRESO" ? Number(amountMinor || 0) : -Number(amountMinor || 0);
}

export function creditCardDebtDelta({ amountMinor, type, paymentMethod = "" }) {
  return type === "GASTO" && paymentMethod === "TARJETA_CREDITO" ? Number(amountMinor || 0) : 0;
}

export function aggregateCashFlowByMonth(operations) {
  return operations.reduce((result, operation) => {
    const month = String(operation.fecha || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return result;
    result[month] ??= { incomeMinor: 0, expenseMinor: 0, transfers: 0, cardPayments: 0 };
    const row = result[month];
    if (operation.sourceOperationCollection === "transferencias") {
      row.transferOperationIds ??= new Set();
      row.transferOperationIds.add(operation.operacionId || operation.id);
      row.transfers = row.transferOperationIds.size;
    } else if (operation.operationCollection === "transferencias" && !operation.legacyEventAnchor) row.transfers += 1;
    else if (operation.operationCollection === "eventosContables") {
      if (operation.eventoTipo === "SALDO_BASE" || (operation.eventoTipo === "AJUSTE" && operation.sourceOperationCollection === "cuentas")) return result;
      const delta = Number(operation.montoDeltaMinor || 0);
      if (delta > 0) row.incomeMinor += delta;
      else row.expenseMinor -= delta;
      if (operation.eventoTipo === "PAGO_TARJETA") row.cardPayments += 1;
    }
    else if (operation.operationCollection === "pagosTarjeta") {
      row.expenseMinor += Number(operation.montoMinor || 0);
      row.cardPayments += 1;
    } else {
      const delta = cashFlowDelta({ amountMinor: operation.montoMinor, type: operation.tipo, paymentMethod: operation.medio_pago });
      if (delta > 0) row.incomeMinor += delta;
      else row.expenseMinor -= delta;
    }
    return result;
  }, {});
}

export function validatePaymentAmount(amountMinor, outstandingMinor) {
  const amount = Number(amountMinor);
  const outstanding = Number(outstandingMinor);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new RangeError("El importe del pago debe ser un entero positivo en unidades menores.");
  if (!Number.isSafeInteger(outstanding) || outstanding < 0) throw new RangeError("El saldo pendiente de la tarjeta no es válido.");
  if (amount > outstanding) throw new RangeError("El pago supera la deuda pendiente de la tarjeta.");
  return amount;
}

export function remainingDebt(totalMinor, paidMinor) {
  return Math.max(0, Number(totalMinor || 0) - Number(paidMinor || 0));
}

export function debtPrincipalChange({ tipoDeuda, operacion, amountMinor }) {
  const amount = Number(amountMinor);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new RangeError("El principal debe ser un entero positivo en unidades menores.");
  if (!["POR_PAGAR", "POR_COBRAR"].includes(tipoDeuda)) throw new TypeError("Clasifica la deuda como por pagar o por cobrar.");
  if (!["PRESTAMO", "PAGO_PRINCIPAL"].includes(operacion)) throw new TypeError("La operación de deuda no es válida.");
  const receivedOrGranted = operacion === "PRESTAMO";
  return {
    cashDeltaMinor: tipoDeuda === "POR_PAGAR" ? (receivedOrGranted ? amount : -amount) : (receivedOrGranted ? -amount : amount),
    principalDeltaMinor: receivedOrGranted ? amount : -amount,
    impact: "NINGUNO",
  };
}

export function debtCostEffect({ tipoDeuda, amountMinor, component }) {
  const amount = Number(amountMinor);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new RangeError("El importe debe ser un entero positivo en unidades menores.");
  if (!["POR_PAGAR", "POR_COBRAR"].includes(tipoDeuda)) throw new TypeError("Clasifica la deuda como por pagar o por cobrar.");
  if (!["INTERES", "COMISION"].includes(component)) throw new TypeError("El componente debe ser interés o comisión.");
  return { cashDeltaMinor: tipoDeuda === "POR_PAGAR" ? -amount : amount, impact: tipoDeuda === "POR_PAGAR" ? "GASTO" : "INGRESO" };
}

export function validateDebtPrincipalPayment(amountMinor, outstandingMinor) {
  const amount = Number(amountMinor);
  const outstanding = Number(outstandingMinor);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new RangeError("El principal pagado debe ser un entero positivo en unidades menores.");
  if (!Number.isSafeInteger(outstanding) || outstanding < 0) throw new RangeError("El principal pendiente no es válido.");
  if (amount > outstanding) throw new RangeError("El principal supera el saldo pendiente.");
  return amount;
}

export function confirmedOutstandingPrincipal(debt) {
  if (debt?.principal_confirmado !== true) throw new Error("Confirma que el saldo registrado corresponde solo a principal.");
  const total = Number(debt.montoTotalMinor);
  const paid = Number(debt.montoPagadoMinor || 0);
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(paid) || paid < 0 || paid > total) throw new RangeError("El principal registrado no es consistente.");
  return total - paid;
}

export function reverseAccountingEvent(event, { correctionId, recordedAt }) {
  if (!event?.id || !correctionId) throw new TypeError("La reversión debe identificar el evento original y su corrección.");
  return {
    ...event,
    id: undefined,
    eventoTipo: "REVERSIÓN",
    montoDeltaMinor: -Number(event.montoDeltaMinor || 0),
    deltaPrincipalMinor: -Number(event.deltaPrincipalMinor || 0),
    fechaEfectiva: event.fechaEfectiva,
    registradoEn: recordedAt,
    eventoRelacionadoId: event.id,
    operacionId: correctionId,
  };
}

export function reconstructBalanceFromEvents(events, throughDate) {
  const baselines = events.filter((event) => event.eventoTipo === "SALDO_BASE" && event.fechaEfectiva <= throughDate);
  if (!baselines.length) return { known: false, balanceMinor: null };
  const latest = baselines.reduce((chosen, event) => event.fechaEfectiva > chosen.fechaEfectiva ? event : chosen);
  const millis = (value) => value?.toMillis?.() ?? (value ? Date.parse(value) : NaN);
  const baselineRecorded = millis(latest.registradoEn);
  const balanceMinor = events.reduce((balance, event) => {
    if (event.eventoTipo === "SALDO_BASE" || event.fechaEfectiva > throughDate) return balance;
    const recorded = millis(event.registradoEn);
    const recordedAfterCutover = Number.isFinite(baselineRecorded) && Number.isFinite(recorded) && recorded >= baselineRecorded;
    if (event.fechaEfectiva <= latest.fechaEfectiva && !recordedAfterCutover) return balance;
    return balance + Number(event.montoDeltaMinor || 0);
  }, Number(latest.montoDeltaMinor));
  return { known: true, balanceMinor };
}

export function aggregateResultByMonth(operations) {
  return operations.reduce((result, operation) => {
    const month = String(operation.fecha || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return result;
    result[month] ??= { incomeMinor: 0, expenseMinor: 0 };
    const amount = Number(operation.montoMinor || 0);
    if (Number.isFinite(operation.deltaIngresoMinor) || Number.isFinite(operation.deltaGastoMinor)) {
      result[month].incomeMinor += Number(operation.deltaIngresoMinor || 0);
      result[month].expenseMinor += Number(operation.deltaGastoMinor || 0);
    } else if (Number.isFinite(operation.deltaResultadoMinor)) {
      const resultDelta = Number(operation.deltaResultadoMinor);
      const impact = operation.impactoResultado || operation.impacto_resultado || operation.tipo;
      if (impact === "INGRESO") result[month].incomeMinor += resultDelta;
      if (impact === "GASTO") result[month].expenseMinor -= resultDelta;
    } else {
      const impact = operation.impacto_resultado || operation.impactoResultado || operation.tipo || "NINGUNO";
      if (impact === "INGRESO") result[month].incomeMinor += amount;
      if (impact === "GASTO") result[month].expenseMinor += amount;
    }
    return result;
  }, {});
}

export function cardUtilization(usedMinor, limitMinor) {
  if (!limitMinor || limitMinor <= 0) return 0;
  return Math.min(100, Math.round((usedMinor / limitMinor) * 100));
}

export function aggregateByMonth(movements) {
  return aggregateResultByMonth(movements);
}
