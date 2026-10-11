import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";

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

test("usuario autenticado puede leer y escribir solo en su espacio permitido", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  const operation = doc(db, "users/alice/movimientos/m1");
  await assertSucceeds(setDoc(operation, movement()));
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
  await assertSucceeds(setDoc(doc(db, "users/alice/movimientos/valid"), movement()));
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
  await assertSucceeds(setDoc(doc(db, "users/alice/deudas/valid"), { ...base, tipo_deuda: "POR_PAGAR", origen_saldo: "SALDO_INICIAL", principal_confirmado: false }));
  await assertFails(setDoc(doc(db, "users/alice/deudas/invalid-type"), { ...base, tipo_deuda: "PRESTAMO" }));
  await assertFails(setDoc(doc(db, "users/alice/deudas/overpaid"), { ...base, tipo_deuda: "POR_COBRAR", montoPagadoMinor: 10_001 }));
  await assertFails(setDoc(doc(db, "users/alice/deudas/unclassified"), base));
});

test("eventos contables válidos son legibles por su dueño e inmutables", async () => {
  const ownerDb = environment.authenticatedContext("alice").firestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/alice/cuentas/cash-1"), { moneda: "PEN", saldoActualMinor: 0 });
  });
  const eventRef = doc(ownerDb, "users/alice/eventosContables/event-1");
  await assertSucceeds(setDoc(eventRef, event({ cuentaId: "cash-1" })));
  await assertSucceeds(getDoc(eventRef));
  await assertFails(updateDoc(eventRef, { montoDeltaMinor: 0 }));
  await assertFails(deleteDoc(eventRef));
  await assertFails(getDoc(doc(environment.authenticatedContext("bob").firestore(), "users/alice/eventosContables/event-1")));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "users/alice/eventosContables/event-1")));
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
    nombre: "Cuenta ficticia", moneda: "PEN", saldoInicialMinor: 20_000,
    saldoActualMinor: 20_000, createdAt: serverTimestamp(),
  }));
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
  await assertSucceeds(setDoc(account, { moneda: "PEN", saldoActualMinor: 12_500, createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(movementRef, movement({ cuenta_id: "cash-1" })));
  await assertSucceeds(updateDoc(movementRef, { montoMinor: 13_000, updatedAt: serverTimestamp() }));

  const correction = writeBatch(db);
  correction.update(movementRef, { anulada: true, anuladaEn: serverTimestamp(), eventoAnulacionId: "reversal-1", updatedAt: serverTimestamp() });
  correction.set(doc(db, "users/alice/eventosContables/reversal-1"), event({
    cuentaId: "cash-1", operacionId: "movement-1", eventoTipo: "REVERSIÓN",
    montoDeltaMinor: -13_000, deltaResultadoMinor: -13_000,
    deltaIngresoMinor: -13_000, deltaGastoMinor: 0,
    impactoResultado: "NINGUNO", eventoRelacionadoId: "movement-event-1",
    motivo: "Corrección ficticia", operacionSnapshot: { tipo: "INGRESO", montoMinor: 13_000 },
  }));
  await assertSucceeds(correction.commit());
  await assertFails(deleteDoc(movementRef));
});

test("deudas admiten pago parcial y archivo al saldarse, con evento vinculado e historial inmutable", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  const account = doc(db, "users/alice/cuentas/cash-1");
  const debtRef = doc(db, "users/alice/deudas/debt-1");
  await assertSucceeds(setDoc(account, { moneda: "PEN", saldoActualMinor: 20_000, createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(debtRef, {
    tipo_deuda: "POR_PAGAR", origen_saldo: "SALDO_INICIAL", principal_confirmado: true,
    montoTotalMinor: 10_000, montoPagadoMinor: 0, moneda: "PEN", createdAt: serverTimestamp(),
  }));

  const settlement = writeBatch(db);
  settlement.update(debtRef, { montoPagadoMinor: 2_500, estado: "PENDIENTE", updatedAt: serverTimestamp() });
  settlement.update(account, { saldoActualMinor: 17_500, updatedAt: serverTimestamp() });
  settlement.set(doc(db, "users/alice/eventosContables/debt-payment-1"), event({
    cuentaId: "cash-1", deudaId: "debt-1", operacionColeccion: "deudas",
    operacionId: "debt-payment-1", eventoTipo: "PAGO_PRINCIPAL",
    montoDeltaMinor: -2_500, deltaPrincipalMinor: -2_500,
    deltaResultadoMinor: 0, deltaIngresoMinor: 0, deltaGastoMinor: 0,
    impactoResultado: "NINGUNO", componenteDeuda: "PRINCIPAL",
    operacionSnapshot: { deudaId: "debt-1", principalMinor: 2_500 },
  }));
  await assertSucceeds(settlement.commit());

  await assertSucceeds(updateDoc(debtRef, { montoPagadoMinor: 10_000, estado: "PAGADA", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(debtRef, { archivada: true, updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(debtRef));
  const eventRef = doc(db, "users/alice/eventosContables/debt-payment-1");
  await assertFails(updateDoc(eventRef, { montoDeltaMinor: 0 }));
  await assertFails(deleteDoc(eventRef));
});
