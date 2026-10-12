import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Load the browser ES module as a data URL so this suite needs no package.json
// change and never initializes Firebase or touches user data.
const source = await readFile(new URL("../js/finance.js", import.meta.url), "utf8");
const finance = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const { debtPrincipalChange, debtCostEffect, validateDebtPrincipalPayment, confirmedOutstandingPrincipal, reverseAccountingEvent, reconstructBalanceFromEvents, aggregateResultByMonth, aggregateCashFlowByMonth } = finance;

test("converts decimal money to integer minor units", () => {
  assert.equal(finance.toMinorUnits(12.34, "PEN"), 1234);
  assert.equal(finance.toMinorUnits(1200, "JPY"), 1200);
});

test("accounts for income, expenses, debit purchases and credit purchases once", () => {
  assert.equal(finance.movementDelta({ amountMinor: 1000, type: "INGRESO", accountId: "a" }), 1000);
  assert.equal(finance.movementDelta({ amountMinor: 250, type: "GASTO", paymentMethod: "TARJETA_DEBITO", accountId: "a" }), -250);
  assert.equal(finance.movementDelta({ amountMinor: 500, type: "GASTO", paymentMethod: "TARJETA_CREDITO", accountId: null }), 0);
});

test("debit card movements resolve to the linked account while credit card movements stay non-cash", () => {
  assert.equal(finance.resolveMovementAccountId({ paymentMethod: "TARJETA_DEBITO", cardAccountId: "cash-1" }), "cash-1");
  assert.equal(finance.resolveMovementAccountId({ paymentMethod: "TARJETA_CREDITO", cardAccountId: "cash-1" }), null);
  assert.equal(finance.movementDelta({ amountMinor: 900, type: "GASTO", paymentMethod: "TARJETA_DEBITO", accountId: "cash-1" }), -900);
});

test("cash flow excludes internal transfers and credit purchases but counts card payments", () => {
  assert.equal(finance.cashFlowDelta({ operationType: "TRANSFERENCIA", amountMinor: 1000 }), 0);
  assert.equal(finance.cashFlowDelta({ type: "GASTO", paymentMethod: "TARJETA_CREDITO", amountMinor: 1000 }), 0);
  assert.equal(finance.cashFlowDelta({ operationType: "PAGO_TARJETA", amountMinor: 300 }), -300);
  assert.equal(finance.cashFlowDelta({ type: "GASTO", paymentMethod: "TARJETA_DEBITO", amountMinor: 300 }), -300);
});

test("aggregates cash flow without treating transfers or credit purchases as cash events", () => {
  assert.deepEqual(finance.aggregateCashFlowByMonth([
    { fecha: "2026-04-01", operationCollection: "movimientos", tipo: "INGRESO", montoMinor: 1000 },
    { fecha: "2026-04-02", operationCollection: "movimientos", tipo: "GASTO", medio_pago: "TARJETA_CREDITO", montoMinor: 400 },
    { fecha: "2026-04-03", operationCollection: "transferencias", montoMinor: 250 },
    { fecha: "2026-04-04", operationCollection: "pagosTarjeta", montoMinor: 300 },
  ]), {
    "2026-04": { incomeMinor: 1000, expenseMinor: 300, transfers: 1, cardPayments: 1 },
  });
});

test("rejects a card payment above the remaining debt", () => {
  assert.equal(finance.validatePaymentAmount(400, 500), 400);
  assert.throws(() => finance.validatePaymentAmount(501, 500), /supera la deuda pendiente/);
  assert.throws(() => finance.validatePaymentAmount(0, 500), /entero positivo/);
});

test("groups real movements by their civil month", () => {
  assert.deepEqual(finance.aggregateByMonth([
    { fecha: "2026-01-31", tipo: "INGRESO", montoMinor: 1000 },
    { fecha: "2026-01-01", tipo: "GASTO", montoMinor: 250 },
    { fecha: "2026-02-01", tipo: "GASTO", montoMinor: 50 },
  ]), {
    "2026-01": { incomeMinor: 1000, expenseMinor: 250 },
    "2026-02": { incomeMinor: 0, expenseMinor: 50 },
  });
});

test("received and granted loans change cash and principal, never earned income or expense", () => {
  assert.deepEqual(debtPrincipalChange({ tipoDeuda: "POR_PAGAR", operacion: "PRESTAMO", amountMinor: 50000 }), { cashDeltaMinor: 50000, principalDeltaMinor: 50000, impact: "NINGUNO" });
  assert.deepEqual(debtPrincipalChange({ tipoDeuda: "POR_COBRAR", operacion: "PRESTAMO", amountMinor: 30000 }), { cashDeltaMinor: -30000, principalDeltaMinor: 30000, impact: "NINGUNO" });
  assert.deepEqual(aggregateResultByMonth([
    { fecha: "2026-05-01", montoMinor: 50000, impactoResultado: "NINGUNO", operationCollection: "movimientos" },
    { fecha: "2026-05-02", montoMinor: 30000, impactoResultado: "NINGUNO", operationCollection: "movimientos" },
  ]), { "2026-05": { incomeMinor: 0, expenseMinor: 0 } });
});

test("partial principal payments reduce outstanding balance and reject overpayment", () => {
  const debt = { tipoDeuda: "POR_PAGAR", totalMinor: 10000, paidMinor: 0 };
  const first = validateDebtPrincipalPayment(2500, debt.totalMinor - debt.paidMinor);
  debt.paidMinor += first;
  const second = validateDebtPrincipalPayment(3500, debt.totalMinor - debt.paidMinor);
  debt.paidMinor += second;
  assert.equal(debt.totalMinor - debt.paidMinor, 4000);
  assert.throws(() => validateDebtPrincipalPayment(4001, 4000), /supera el saldo pendiente/);
  assert.deepEqual(debtPrincipalChange({ tipoDeuda: "POR_PAGAR", operacion: "PAGO_PRINCIPAL", amountMinor: 2500 }), { cashDeltaMinor: -2500, principalDeltaMinor: -2500, impact: "NINGUNO" });
  assert.deepEqual(debtPrincipalChange({ tipoDeuda: "POR_COBRAR", operacion: "PAGO_PRINCIPAL", amountMinor: 2500 }), { cashDeltaMinor: 2500, principalDeltaMinor: -2500, impact: "NINGUNO" });
});

test("legacy debt amounts cannot be amortized as principal until confirmed", () => {
  assert.throws(() => confirmedOutstandingPrincipal({ montoTotalMinor: 10000, montoPagadoMinor: 2000 }), /Confirma que el saldo/);
  assert.equal(confirmedOutstandingPrincipal({ principal_confirmado: true, montoTotalMinor: 10000, montoPagadoMinor: 2000 }), 8000);
});

test("interest and fees are separate recognized income or expense", () => {
  assert.deepEqual(debtCostEffect({ tipoDeuda: "POR_PAGAR", amountMinor: 700, component: "INTERES" }), { cashDeltaMinor: -700, impact: "GASTO" });
  assert.deepEqual(debtCostEffect({ tipoDeuda: "POR_COBRAR", amountMinor: 300, component: "COMISION" }), { cashDeltaMinor: 300, impact: "INGRESO" });
});

test("retroactive correction reverses the original event and retains its effective date", () => {
  const original = { id: "event-1", eventoTipo: "MOVIMIENTO", montoDeltaMinor: -1000, deltaPrincipalMinor: 0, fechaEfectiva: "2026-01-12", registradoEn: "2026-01-12T10:00:00Z" };
  const reversal = reverseAccountingEvent(original, { correctionId: "op-1", recordedAt: "2026-05-30T16:00:00Z" });
  assert.equal(reversal.montoDeltaMinor, 1000);
  assert.equal(reversal.eventoRelacionadoId, "event-1");
  assert.equal(reversal.fechaEfectiva, original.fechaEfectiva);
  assert.equal(reversal.registradoEn, "2026-05-30T16:00:00Z");
});

test("transfers conserve combined cash and balances remain unknown without confirmed baseline", () => {
  const from = 12000;
  const to = 4000;
  const transfer = 2500;
  assert.equal((from - transfer) + (to + transfer), from + to);
  assert.deepEqual(reconstructBalanceFromEvents([{ eventoTipo: "MOVIMIENTO", montoDeltaMinor: -500, fechaEfectiva: "2026-01-02" }], "2026-01-31"), { known: false, balanceMinor: null });
  assert.deepEqual(reconstructBalanceFromEvents([
    { eventoTipo: "SALDO_BASE", montoDeltaMinor: 10000, fechaEfectiva: "2026-01-01" },
    { eventoTipo: "MOVIMIENTO", montoDeltaMinor: 2500, fechaEfectiva: "2026-01-02" },
    { eventoTipo: "TRANSFERENCIA", montoDeltaMinor: -1000, fechaEfectiva: "2026-01-03" },
  ], "2026-01-31"), { known: true, balanceMinor: 11500 });
});

test("flow events preserve cash direction while excluding paired transfer legs", () => {
  const rows = finance.aggregateCashFlowByMonth([
    { fecha: "2026-06-01", operationCollection: "eventosContables", eventoTipo: "PRESTAMO", montoDeltaMinor: 20000, sourceOperationCollection: "deudas" },
    { fecha: "2026-06-03", operationCollection: "eventosContables", eventoTipo: "PAGO_PRINCIPAL", montoDeltaMinor: -3000, sourceOperationCollection: "deudas" },
    { fecha: "2026-06-04", operationCollection: "eventosContables", eventoTipo: "TRANSFERENCIA", operacionId: "tx-1", montoDeltaMinor: -5000, sourceOperationCollection: "transferencias" },
    { fecha: "2026-06-04", operationCollection: "eventosContables", eventoTipo: "TRANSFERENCIA", operacionId: "tx-1", montoDeltaMinor: 5000, sourceOperationCollection: "transferencias" },
  ]);
  assert.equal(rows["2026-06"].incomeMinor, 20000);
  assert.equal(rows["2026-06"].expenseMinor, 3000);
  assert.equal(rows["2026-06"].transfers, 1);
});

test("corrected retroactive event changes the effective-period balance from a confirmed cutover", () => {
  const baseline = { id: "base", eventoTipo: "SALDO_BASE", montoDeltaMinor: 9000, fechaEfectiva: "2026-04-01", registradoEn: "2026-04-01T10:00:00Z" };
  const reversal = { id: "rev", eventoTipo: "REVERSIÓN", montoDeltaMinor: 1000, fechaEfectiva: "2026-03-20", registradoEn: "2026-05-10T10:00:00Z" };
  const adjustment = { id: "adj", eventoTipo: "AJUSTE", montoDeltaMinor: -700, fechaEfectiva: "2026-03-20", registradoEn: "2026-05-10T10:00:00Z" };
  assert.deepEqual(reconstructBalanceFromEvents([baseline, reversal, adjustment], "2026-06-30"), { known: true, balanceMinor: 9300 });
  assert.deepEqual(reconstructBalanceFromEvents([baseline, reversal, adjustment], "2026-03-31"), { known: false, balanceMinor: null });
});

test("result aggregation reverses a corrected entry and keeps debt principal out of profit", () => {
  assert.deepEqual(aggregateResultByMonth([
    { fecha: "2026-02-10", montoMinor: 10000, deltaResultadoMinor: -10000, deltaGastoMinor: 10000 },
    { fecha: "2026-02-10", montoMinor: 10000, deltaResultadoMinor: 10000, deltaGastoMinor: -10000 },
    { fecha: "2026-02-10", montoMinor: 8500, deltaResultadoMinor: -8500, deltaGastoMinor: 8500 },
    { fecha: "2026-02-11", montoMinor: 8500, deltaResultadoMinor: 0, deltaGastoMinor: 0 },
  ]), { "2026-02": { incomeMinor: 0, expenseMinor: 8500 } });
});

test("legacy correction anchor plus linked events retains the corrected result without losing history", () => {
  const rows = [
    { operationCollection: "movimientos", fecha: "2025-01-12", tipo: "INGRESO", montoMinor: 10_000, legacyEventAnchor: true },
    { operationCollection: "eventosContables", fecha: "2025-01-12", deltaIngresoMinor: -10_000, deltaGastoMinor: 0 },
    { operationCollection: "eventosContables", fecha: "2025-01-12", deltaIngresoMinor: 12_500, deltaGastoMinor: 0 },
  ];
  assert.deepEqual(aggregateResultByMonth(rows), { "2025-01": { incomeMinor: 12_500, expenseMinor: 0 } });
});

test("legacy transfer anchor and its two event legs count as one transfer", () => {
  const rows = [
    { operationCollection: "transferencias", fecha: "2025-01-12", legacyEventAnchor: true },
    { operationCollection: "eventosContables", sourceOperationCollection: "transferencias", operacionId: "tx-1", fecha: "2025-01-12", eventoTipo: "TRANSFERENCIA", montoDeltaMinor: -5_000 },
    { operationCollection: "eventosContables", sourceOperationCollection: "transferencias", operacionId: "tx-1", fecha: "2025-01-12", eventoTipo: "TRANSFERENCIA", montoDeltaMinor: 5_000 },
  ];
  assert.equal(aggregateCashFlowByMonth(rows)["2025-01"].transfers, 1);
});
