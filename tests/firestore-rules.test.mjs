import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";

const projectId = "demo-masterfull-local";
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});

beforeEach(async () => environment.clearFirestore());
after(async () => environment.cleanup());

function movement(overrides = {}) {
  return {
    tipo: "INGRESO",
    medio_pago: "EFECTIVO",
    montoMinor: 12_500,
    moneda: "PEN",
    fecha: "2026-01-10",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    cuentaId: null,
    deudaId: null,
    operacionColeccion: "movimientos",
    operacionId: "movement-1",
    eventoTipo: "MOVIMIENTO",
    montoDeltaMinor: 12_500,
    deltaPrincipalMinor: 0,
    deltaResultadoMinor: 12_500,
    deltaIngresoMinor: 12_500,
    deltaGastoMinor: 0,
    moneda: "PEN",
    fechaEfectiva: "2026-01-10",
    impactoResultado: "INGRESO",
    componenteDeuda: null,
    eventoRelacionadoId: null,
    motivo: null,
    operacionSnapshot: { tipo: "INGRESO", montoMinor: 12_500 },
    registradoEn: serverTimestamp(),
    creadoEn: serverTimestamp(),
    ...overrides,
  };
}

async function createBaselineAccount(db, id, amount = 0) {
  const accountRef = doc(db, `users/alice/cuentas/${id}`);
  const eventId = `${id}-baseline`;
  const baseline = event({
    cuentaId: id, operacionColeccion: "cuentas", operacionId: id, eventoTipo: "SALDO_BASE",
    montoDeltaMinor: amount, deltaResultadoMinor: 0, deltaIngresoMinor: 0, deltaGastoMinor: 0,
    impactoResultado: "NINGUNO", operacionSnapshot: { saldoConfirmado: true },
  });
  const batch = writeBatch(db);
  batch.set(accountRef, {
    nombre: "Cuenta ficticia", moneda: "PEN", saldoInicialMinor: amount,
    saldoActualMinor: amount, ultimoEventoContableId: eventId, ultimaOperacionContableId: id,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, `users/alice/eventosContables/${eventId}`), baseline);
  await assertSucceeds(batch.commit());
  return accountRef;
}

async function createDebtBaseline(db, id, overrides = {}) {
  const debtRef = doc(db, `users/alice/deudas/${id}`);
  const eventId = `${id}-baseline`;
  const debt = {
    tipo_deuda: "POR_PAGAR", origen_saldo: "SALDO_INICIAL", principal_confirmado: false,
    montoTotalMinor: 10_000, montoPagadoMinor: 0, moneda: "PEN", ...overrides,
  };
  const batch = writeBatch(db);
  batch.set(debtRef, { ...debt, ultimoEventoContableId: eventId, ultimaOperacionContableId: id, createdAt: serverTimestamp() });
  batch.set(doc(db, `users/alice/eventosContables/${eventId}`), event({
    cuentaId: null, deudaId: id, operacionColeccion: "deudas", operacionId: id,
    eventoTipo: "SALDO_BASE", montoDeltaMinor: 0, deltaPrincipalMinor: debt.principal_confirmado ? debt.montoTotalMinor : 0,
    deltaResultadoMinor: 0, deltaIngresoMinor: 0, deltaGastoMinor: 0, impactoResultado: "NINGUNO",
    operacionSnapshot: { deuda_id: id, deudaId: id, montoTotalMinor: debt.montoTotalMinor },
  }));
  await assertSucceeds(batch.commit());
  return debtRef;
}

async function writeMovement(db, id, overrides = {}) {
  const row = movement({ ...overrides, cuenta_id: Object.hasOwn(overrides, "cuenta_id") ? overrides.cuenta_id : null });
  const eventId = `${id}-event`;
  const batch = writeBatch(db);
  batch.set(doc(db, `users/alice/movimientos/${id}`), { ...row, eventoContableId: eventId });
  batch.set(doc(db, `users/alice/eventosContables/${eventId}`), event({
    cuentaId: row.cuenta_id, operacionColeccion: "movimientos", operacionId: id,
    eventoTipo: "MOVIMIENTO", montoDeltaMinor: row.tipo === "INGRESO" ? row.montoMinor : -row.montoMinor,
    deltaResultadoMinor: row.tipo === "INGRESO" ? row.montoMinor : -row.montoMinor,
    deltaIngresoMinor: row.tipo === "INGRESO" ? row.montoMinor : 0,
    deltaGastoMinor: row.tipo === "GASTO" ? row.montoMinor : 0,
    impactoResultado: row.tipo, operacionSnapshot: { ...row },
  }));
  await assertSucceeds(batch.commit());
}

test("usuario autenticado puede leer y escribir solo en su espacio permitido", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  const operation = doc(db, "users/alice/movimientos/m1");
  await assertFails(setDoc(operation, movement()));
  await writeMovement(db, "m1");
  await assertSucceeds(getDoc(operation));
  await assertSucceeds(getDocs(collection(db, "users/alice/movimientos")));
});

test("bloquea lecturas y escrituras sin autenticación", async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "users/alice/movimientos/m1")));
  await assertFails(setDoc(doc(db, "users/alice/movimientos/m1"), movement()));
});

test("bloquea el acceso cruzado entre usuarios", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  await assertFails(getDoc(doc(db, "users/bob/movimientos/m1")));
  await assertFails(setDoc(doc(db, "users/bob/movimientos/m1"), movement()));
});

test("valida importes, tipos y moneda de movimientos y transferencias", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  await writeMovement(db, "valid", { cuenta_id: null });
  await assertFails(setDoc(doc(db, "users/alice/movimientos/negative"), movement({ montoMinor: -1 })));
  await assertFails(setDoc(doc(db, "users/alice/movimientos/zero"), movement({ montoMinor: 0 })));
  await assertFails(setDoc(doc(db, "users/alice/movimientos/invalid-type"), movement({ tipo: "PRESTAMO" })));
  await assertFails(setDoc(doc(db, "users/alice/movimientos/invalid-method"), movement({ medio_pago: "CRIPTOMONEDA" })));
  await assertFails(setDoc(doc(db, "users/alice/movimientos/invalid-currency"), movement({ moneda: "XXX" })));
  await assertFails(setDoc(doc(db, "users/alice/movimientos/missing-type"), { montoMinor: 500, moneda: "PEN" }));
  await assertFails(setDoc(doc(db, "users/alice/transferencias/same-account"), {
    montoMinor: 500, moneda: "PEN", cuenta_origen_id: "a", cuenta_destino_id: "a", createdAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(db, "users/alice/pagosTarjeta/missing-card"), {
    montoMinor: 500, moneda: "PEN", cuenta_id: "a", createdAt: serverTimestamp(),
  }));
});

test("valida tipos y saldos de deudas", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  const base = { montoTotalMinor: 10_000, montoPagadoMinor: 0, moneda: "PEN", createdAt: serverTimestamp() };
  await createDebtBaseline(db, "valid", { tipo_deuda: "POR_PAGAR", origen_saldo: "SALDO_INICIAL", principal_confirmado: false });
  await assertFails(setDoc(doc(db, "users/alice/deudas/invalid-type"), { ...base, tipo_deuda: "PRESTAMO" }));
  await assertFails(setDoc(doc(db, "users/alice/deudas/overpaid"), { ...base, tipo_deuda: "POR_COBRAR", montoPagadoMinor: 10_001 }));
  await assertFails(setDoc(doc(db, "users/alice/deudas/unclassified"), base));
});

test("eventos contables válidos son legibles por su dueño e inmutables", async () => {
  const ownerDb = environment.authenticatedContext("alice").firestore();
  await createBaselineAccount(ownerDb, "cash-1", 0);
  const eventRef = doc(ownerDb, "users/alice/eventosContables/cash-1-baseline");
  await assertSucceeds(getDoc(eventRef));
  await assertFails(updateDoc(eventRef, { montoDeltaMinor: 0 }));
  await assertFails(deleteDoc(eventRef));
  await assertFails(getDoc(doc(environment.authenticatedContext("bob").firestore(), "users/alice/eventosContables/event-1")));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "users/alice/eventosContables/event-1")));
});

test("rechaza saldos y operaciones con eventos ausentes, preexistentes o de otro usuario", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  const account = await createBaselineAccount(db, "cash-1", 0);
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/bob/eventosContables/bob-event"), event({ cuentaId: null }));
  });
  await assertFails(updateDoc(account, {
    saldoActualMinor: 100, ultimoEventoContableId: "does-not-exist", ultimaOperacionContableId: "op-1",
  }));
  await assertFails(updateDoc(account, {
    saldoActualMinor: 100, ultimoEventoContableId: "bob-event", ultimaOperacionContableId: "op-1",
  }));
  const operation = doc(db, "users/alice/movimientos/unlinked-ref");
  await assertFails(setDoc(operation, { ...movement({ cuenta_id: null }), eventoContableId: "missing-event" }));
  await assertFails(setDoc(doc(db, "users/alice/eventosContables/orphan-event"), event({
    operacionId: "not-created", cuentaId: null, eventoTipo: "MOVIMIENTO",
  })));
  // A valid event is immutable and cannot be replayed as a pointer in a later transaction.
  await assertFails(updateDoc(account, {
    saldoActualMinor: 1, ultimoEventoContableId: "cash-1-baseline", ultimaOperacionContableId: "cash-1",
  }));
});

test("rechaza eventos mal formados y referencias de cuenta inexistentes", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  await assertFails(setDoc(doc(db, "users/alice/eventosContables/invalid-amount"), event({ montoDeltaMinor: "12500" })));
  await assertFails(setDoc(doc(db, "users/alice/eventosContables/invalid-kind"), event({ eventoTipo: "BORRAR" })));
  await assertFails(setDoc(doc(db, "users/alice/eventosContables/missing-account"), event({ cuentaId: "not-created" })));
});

test("permite crear, editar y eliminar personas y propietarios sin referencias", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  for (const collectionName of ["personas", "propietarios"]) {
    const ref = doc(db, `users/alice/${collectionName}/${collectionName}-1`);
    await assertSucceeds(setDoc(ref, { nombre: "Registro ficticio", createdAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { nombre: "Registro ficticio editado", updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(ref));
    const deleted = await assertSucceeds(getDoc(ref));
    assert.equal(deleted.exists(), false);
  }
});

test("cuentas y tarjetas admiten alta, edición y archivo, pero no borrado físico", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  const account = doc(db, "users/alice/cuentas/account-1");
  const card = doc(db, "users/alice/tarjetas/card-1");

  await assertSucceeds(setDoc(account, {
    nombre: "Cuenta ficticia", moneda: "PEN", saldoInicialMinor: 0,
    saldoActualMinor: 0, createdAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(account, { saldoActualMinor: 20_000, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(account, { nombre: "Cuenta editada", estado: "ARCHIVADA", updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(account));

  await assertSucceeds(setDoc(card, {
    nombre: "Tarjeta ficticia", tipo: "CREDITO", moneda: "PEN",
    lineaCreditoMinor: 100_000, utilizadoMinor: 0, createdAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(card, { nombre: "Tarjeta editada", archivada: true, updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(card));
});

test("movimientos admiten alta, edición y anulación auditada, pero no borrado físico", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  const account = doc(db, "users/alice/cuentas/cash-1");
  const movementRef = doc(db, "users/alice/movimientos/movement-1");
  await createBaselineAccount(db, "cash-1", 0);
  await assertFails(setDoc(movementRef, movement({ cuenta_id: "cash-1" })));
  await writeMovement(db, "movement-1", { montoMinor: 12_500, cuenta_id: "cash-1" });
  await assertFails(updateDoc(movementRef, { montoMinor: 13_000, updatedAt: serverTimestamp() }));

  const correction = writeBatch(db);
  correction.update(movementRef, { anulada: true, anuladaEn: serverTimestamp(), eventoAnulacionId: "reversal-1", updatedAt: serverTimestamp() });
  correction.set(doc(db, "users/alice/eventosContables/reversal-1"), event({
    cuentaId: "cash-1", operacionId: "movement-1", eventoTipo: "REVERSIÓN",
    montoDeltaMinor: -12_500, deltaResultadoMinor: -12_500,
    deltaIngresoMinor: -12_500, deltaGastoMinor: 0,
    impactoResultado: "NINGUNO", eventoRelacionadoId: "movement-1-event",
    motivo: "Anulación ficticia", operacionSnapshot: { tipo: "INGRESO", montoMinor: 12_500 },
  }));
  await assertSucceeds(correction.commit());
  await assertFails(setDoc(doc(db, "users/alice/movimientos/unlinked"), movement()));
  await assertFails(deleteDoc(movementRef));
});

test("deudas admiten pago parcial y archivo al saldarse, con evento vinculado e historial inmutable", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  const account = doc(db, "users/alice/cuentas/cash-1");
  const debtRef = doc(db, "users/alice/deudas/debt-1");
  await createBaselineAccount(db, "cash-1", 20_000);
  await createDebtBaseline(db, "debt-1", { tipo_deuda: "POR_PAGAR", principal_confirmado: true });

  const settlement = writeBatch(db);
  settlement.update(debtRef, { montoPagadoMinor: 2_500, estado: "PENDIENTE", ultimoEventoContableId: "debt-payment-1", ultimaOperacionContableId: "debt-payment-1", updatedAt: serverTimestamp() });
  settlement.update(account, { saldoActualMinor: 17_500, ultimoEventoContableId: "debt-payment-1", ultimaOperacionContableId: "debt-payment-1", updatedAt: serverTimestamp() });
  settlement.set(doc(db, "users/alice/eventosContables/debt-payment-1"), event({
    cuentaId: "cash-1", deudaId: "debt-1", operacionColeccion: "deudas",
    operacionId: "debt-payment-1", eventoTipo: "PAGO_PRINCIPAL",
    montoDeltaMinor: -2_500, deltaPrincipalMinor: -2_500,
    deltaResultadoMinor: 0, deltaIngresoMinor: 0, deltaGastoMinor: 0,
    impactoResultado: "NINGUNO", componenteDeuda: "PRINCIPAL",
    operacionSnapshot: { deudaId: "debt-1", principalMinor: 2_500 },
  }));
  await assertSucceeds(settlement.commit());

  await assertFails(updateDoc(debtRef, { montoPagadoMinor: 10_000, estado: "PAGADA", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(debtRef, { archivada: true, updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(debtRef));
  const eventRef = doc(db, "users/alice/eventosContables/debt-payment-1");
  await assertFails(updateDoc(eventRef, { montoDeltaMinor: 0 }));
  await assertFails(deleteDoc(eventRef));
});

test("transferencias actualizan las dos cuentas con eventos vinculados en un mismo batch", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  const source = await createBaselineAccount(db, "source", 10_000);
  const destination = await createBaselineAccount(db, "destination", 0);
  const transferId = "transfer-1";
  const operation = doc(db, `users/alice/transferencias/${transferId}`);
  const sourceEventId = "transfer-source-event";
  const destinationEventId = "transfer-destination-event";
  const batch = writeBatch(db);
  batch.update(source, { saldoActualMinor: 8_000, ultimoEventoContableId: sourceEventId, ultimaOperacionContableId: transferId });
  batch.update(destination, { saldoActualMinor: 2_000, ultimoEventoContableId: destinationEventId, ultimaOperacionContableId: transferId });
  batch.set(operation, {
    cuenta_origen_id: "source", cuenta_destino_id: "destination", montoMinor: 2_000,
    moneda: "PEN", fecha: "2026-01-11", eventoContableId: destinationEventId, createdAt: serverTimestamp(),
  });
  for (const [eventId, accountId, delta] of [[sourceEventId, "source", -2_000], [destinationEventId, "destination", 2_000]]) {
    batch.set(doc(db, `users/alice/eventosContables/${eventId}`), event({
      cuentaId: accountId, operacionColeccion: "transferencias", operacionId: transferId,
      eventoTipo: "TRANSFERENCIA", montoDeltaMinor: delta, deltaResultadoMinor: 0,
      deltaIngresoMinor: 0, deltaGastoMinor: 0, impactoResultado: "NINGUNO",
      operacionSnapshot: { cuenta_origen_id: "source", cuenta_destino_id: "destination", montoMinor: 2_000 },
    }));
  }
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(source)).data().saldoActualMinor, 8_000);
  assert.equal((await getDoc(destination)).data().saldoActualMinor, 2_000);
});

test("pago de tarjeta vincula movimiento, cuenta, tarjeta y evento", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  const account = await createBaselineAccount(db, "cash-1", 10_000);
  const card = doc(db, "users/alice/tarjetas/card-1");
  const cardEventId = "card-baseline";
  const cardBatch = writeBatch(db);
  cardBatch.set(card, {
    nombre: "Tarjeta ficticia", tipo: "CREDITO", moneda: "PEN", lineaCreditoMinor: 20_000,
    saldoInicialUsadoMinor: 5_000, utilizadoMinor: 5_000, ultimoEventoContableId: cardEventId,
    ultimaOperacionContableId: "card-1", createdAt: serverTimestamp(),
  });
  cardBatch.set(doc(db, `users/alice/eventosContables/${cardEventId}`), event({
    cuentaId: null, operacionColeccion: "tarjetas", operacionId: "card-1", eventoTipo: "SALDO_BASE",
    montoDeltaMinor: 0, deltaPrincipalMinor: 5_000, deltaResultadoMinor: 0,
    deltaIngresoMinor: 0, deltaGastoMinor: 0, impactoResultado: "NINGUNO",
    operacionSnapshot: { tarjeta_id: "card-1", saldoConfirmado: true },
  }));
  await assertSucceeds(cardBatch.commit());

  const paymentId = "payment-1";
  const paymentEventId = "payment-event";
  const payment = doc(db, `users/alice/pagosTarjeta/${paymentId}`);
  const batch = writeBatch(db);
  batch.update(account, { saldoActualMinor: 8_000, ultimoEventoContableId: paymentEventId, ultimaOperacionContableId: paymentId });
  batch.update(card, { utilizadoMinor: 3_000, ultimoEventoContableId: paymentEventId, ultimaOperacionContableId: paymentId });
  batch.set(payment, { cuenta_id: "cash-1", tarjeta_id: "card-1", montoMinor: 2_000, moneda: "PEN", eventoContableId: paymentEventId, createdAt: serverTimestamp() });
  batch.set(doc(db, `users/alice/eventosContables/${paymentEventId}`), event({
    cuentaId: "cash-1", operacionColeccion: "pagosTarjeta", operacionId: paymentId,
    eventoTipo: "PAGO_TARJETA", montoDeltaMinor: -2_000, deltaPrincipalMinor: -2_000,
    deltaResultadoMinor: 0, deltaIngresoMinor: 0, deltaGastoMinor: 0,
    impactoResultado: "NINGUNO", operacionSnapshot: { cuenta_id: "cash-1", tarjeta_id: "card-1", montoMinor: 2_000 },
  }));
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(account)).data().saldoActualMinor, 8_000);
  assert.equal((await getDoc(card)).data().utilizadoMinor, 3_000);
});

test("préstamo recibido crea deuda y aumenta efectivo con un evento compartido", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  const account = await createBaselineAccount(db, "cash-1", 10_000);
  const debtId = "loan-1";
  const eventId = "loan-event";
  const debt = doc(db, `users/alice/deudas/${debtId}`);
  const batch = writeBatch(db);
  batch.set(debt, {
    tipo_deuda: "POR_PAGAR", origen_saldo: "PRESTAMO_NUEVO", principal_confirmado: true,
    montoTotalMinor: 5_000, montoPagadoMinor: 0, moneda: "PEN", cuenta_id: "cash-1",
    ultimoEventoContableId: eventId, ultimaOperacionContableId: debtId, createdAt: serverTimestamp(),
  });
  batch.update(account, { saldoActualMinor: 15_000, ultimoEventoContableId: eventId, ultimaOperacionContableId: debtId });
  batch.set(doc(db, `users/alice/eventosContables/${eventId}`), event({
    cuentaId: "cash-1", deudaId: debtId, operacionColeccion: "deudas", operacionId: debtId,
    eventoTipo: "PRESTAMO", montoDeltaMinor: 5_000, deltaPrincipalMinor: 5_000,
    deltaResultadoMinor: 0, deltaIngresoMinor: 0, deltaGastoMinor: 0,
    impactoResultado: "NINGUNO", componenteDeuda: "PRINCIPAL",
    operacionSnapshot: { deuda_id: debtId, montoTotalMinor: 5_000 },
  }));
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(account)).data().saldoActualMinor, 15_000);
  assert.equal((await getDoc(debt)).data().montoPagadoMinor, 0);
});

test("dos transacciones simultáneas conservan ambos movimientos y el saldo acumulado", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  const account = await createBaselineAccount(db, "cash-1", 0);
  const commitIncome = (id) => runTransaction(db, async (transaction) => {
    const current = await transaction.get(account);
    const eventId = `${id}-event`;
    const eventRef = doc(db, `users/alice/eventosContables/${eventId}`);
    transaction.update(account, { saldoActualMinor: current.data().saldoActualMinor + 1_000, ultimoEventoContableId: eventId, ultimaOperacionContableId: id });
    transaction.set(doc(db, `users/alice/movimientos/${id}`), {
      tipo: "INGRESO", medio_pago: "EFECTIVO", cuenta_id: "cash-1", montoMinor: 1_000,
      moneda: "PEN", fecha: "2026-01-12", eventoContableId: eventId, createdAt: serverTimestamp(),
    });
    transaction.set(eventRef, event({
      cuentaId: "cash-1", operacionColeccion: "movimientos", operacionId: id,
      eventoTipo: "MOVIMIENTO", montoDeltaMinor: 1_000, deltaResultadoMinor: 1_000,
      deltaIngresoMinor: 1_000, deltaGastoMinor: 0, operacionSnapshot: { tipo: "INGRESO", cuenta_id: "cash-1", montoMinor: 1_000 },
    }));
  });
  await Promise.all([commitIncome("concurrent-a"), commitIncome("concurrent-b")]);
  assert.equal((await getDoc(account)).data().saldoActualMinor, 2_000);
  assert.equal((await getDoc(doc(db, "users/alice/movimientos/concurrent-a"))).exists(), true);
  assert.equal((await getDoc(doc(db, "users/alice/movimientos/concurrent-b"))).exists(), true);
});
