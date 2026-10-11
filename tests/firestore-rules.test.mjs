import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

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
