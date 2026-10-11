import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, setDoc, updateDoc,
  writeBatch,
} from "firebase/firestore";

const projectId = "demo-masterfull-local";
const apps = [];
let aliceDb;
let aliceUid;
let bobDb;
let bobUid;
let anonymousDb;

async function newEmulatorUser(label) {
  const app = initializeApp({ apiKey: "fake-api-key", authDomain: "localhost", projectId }, `${label}-${Date.now()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, `${label}-${Date.now()}@example.invalid`, "Local-only-test-Password-123!");
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  return { db, uid: credential.user.uid };
}

before(async () => {
  ({ db: aliceDb, uid: aliceUid } = await newEmulatorUser("alice"));
  ({ db: bobDb, uid: bobUid } = await newEmulatorUser("bob"));
  const anonymousApp = initializeApp({ apiKey: "fake-api-key", authDomain: "localhost", projectId }, "anonymous-test");
  apps.push(anonymousApp);
  const auth = getAuth(anonymousApp);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  anonymousDb = getFirestore(anonymousApp);
  connectFirestoreEmulator(anonymousDb, "127.0.0.1", 8080);
});

after(async () => Promise.all(apps.map((app) => deleteApp(app))));

test("la cuenta efímera de Auth Emulator solo accede a sus documentos ficticios", async () => {
  const ownAccount = doc(aliceDb, `users/${aliceUid}/cuentas/test-account`);
  const baseEventId = "test-account-baseline";
  const baseline = writeBatch(aliceDb);
  baseline.set(ownAccount, {
    nombre: "Cuenta ficticia de prueba", moneda: "PEN", saldoInicialMinor: 50_000,
    saldoActualMinor: 50_000, ultimoEventoContableId: baseEventId,
    ultimaOperacionContableId: "test-account", createdAt: serverTimestamp(),
  });
  baseline.set(doc(aliceDb, `users/${aliceUid}/eventosContables/${baseEventId}`), {
    cuentaId: "test-account", deudaId: null, operacionColeccion: "cuentas", operacionId: "test-account",
    eventoTipo: "SALDO_BASE", montoDeltaMinor: 50_000, deltaPrincipalMinor: 0,
    deltaResultadoMinor: 0, deltaIngresoMinor: 0, deltaGastoMinor: 0, moneda: "PEN",
    fechaEfectiva: "2026-10-01", impactoResultado: "NINGUNO", componenteDeuda: null,
    eventoRelacionadoId: null, motivo: null, operacionSnapshot: { saldoConfirmado: true },
    registradoEn: serverTimestamp(), creadoEn: serverTimestamp(),
  });
  await baseline.commit();
  assert.equal((await getDoc(ownAccount)).exists(), true);

  const foreignAccount = doc(bobDb, `users/${aliceUid}/cuentas/test-account`);
  await assert.rejects(getDoc(foreignAccount), (error) => error.code === "permission-denied");
  await assert.rejects(getDoc(doc(anonymousDb, `users/${aliceUid}/cuentas/test-account`)), (error) => error.code === "permission-denied");
  assert.notEqual(aliceUid, bobUid);
});

test("el cliente puede crear y corregir un movimiento con eventos append-only", async () => {
  const accountRef = doc(aliceDb, `users/${aliceUid}/cuentas/test-account`);
  const movementRef = doc(aliceDb, `users/${aliceUid}/movimientos/test-income`);
  const originalEventRef = doc(aliceDb, `users/${aliceUid}/eventosContables/test-income-event`);
  const first = writeBatch(aliceDb);
  first.set(movementRef, {
    tipo: "INGRESO", medio_pago: "EFECTIVO", montoMinor: 12_500, moneda: "PEN", cuenta_id: "test-account",
    fecha: "2026-10-01", eventoContableId: originalEventRef.id,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  first.set(originalEventRef, {
    cuentaId: "test-account", deudaId: null, operacionColeccion: "movimientos", operacionId: movementRef.id,
    eventoTipo: "MOVIMIENTO", montoDeltaMinor: 12_500, deltaPrincipalMinor: 0,
    deltaResultadoMinor: 12_500, deltaIngresoMinor: 12_500, deltaGastoMinor: 0, moneda: "PEN",
    fechaEfectiva: "2026-10-01", impactoResultado: "INGRESO", componenteDeuda: null,
    eventoRelacionadoId: null, motivo: null, operacionSnapshot: { tipo: "INGRESO", cuenta_id: "test-account", montoMinor: 12_500 },
    registradoEn: serverTimestamp(), creadoEn: serverTimestamp(),
  });
  first.update(accountRef, { saldoActualMinor: 62_500, ultimoEventoContableId: originalEventRef.id, ultimaOperacionContableId: movementRef.id, updatedAt: serverTimestamp() });
  await first.commit();

  const correction = writeBatch(aliceDb);
  const replacementEventId = "test-replacement-event";
  correction.update(movementRef, { montoMinor: 14_000, eventoContableId: replacementEventId, updatedAt: serverTimestamp() });
  correction.update(accountRef, { saldoActualMinor: 64_000, ultimoEventoContableId: replacementEventId, ultimaOperacionContableId: movementRef.id, updatedAt: serverTimestamp() });
  correction.set(doc(aliceDb, `users/${aliceUid}/eventosContables/test-reversal`), {
    cuentaId: "test-account", deudaId: null, operacionColeccion: "movimientos", operacionId: movementRef.id,
    eventoTipo: "REVERSIÓN", montoDeltaMinor: -12_500, deltaPrincipalMinor: 0,
    deltaResultadoMinor: -12_500, deltaIngresoMinor: -12_500, deltaGastoMinor: 0, moneda: "PEN",
    fechaEfectiva: "2026-10-01", impactoResultado: "NINGUNO", componenteDeuda: null,
    eventoRelacionadoId: originalEventRef.id, motivo: "Corrección ficticia de prueba",
    operacionSnapshot: { tipo: "INGRESO", montoMinor: 12_500 },
    registradoEn: serverTimestamp(), creadoEn: serverTimestamp(),
  });
  correction.set(doc(aliceDb, `users/${aliceUid}/eventosContables/${replacementEventId}`), {
    cuentaId: "test-account", deudaId: null, operacionColeccion: "movimientos", operacionId: movementRef.id,
    eventoTipo: "MOVIMIENTO", montoDeltaMinor: 14_000, deltaPrincipalMinor: 0,
    deltaResultadoMinor: 14_000, deltaIngresoMinor: 14_000, deltaGastoMinor: 0, moneda: "PEN",
    fechaEfectiva: "2026-10-01", impactoResultado: "INGRESO", componenteDeuda: null,
    eventoRelacionadoId: originalEventRef.id, motivo: null,
    operacionSnapshot: { tipo: "INGRESO", cuenta_id: "test-account", montoMinor: 14_000 },
    registradoEn: serverTimestamp(), creadoEn: serverTimestamp(),
  });
  await correction.commit();

  assert.equal((await getDoc(movementRef)).data().montoMinor, 14_000);
  assert.equal((await getDoc(accountRef)).data().saldoActualMinor, 64_000);
  assert.equal((await getDoc(originalEventRef)).data().montoDeltaMinor, 12_500);
  await assert.rejects(updateDoc(originalEventRef, { montoDeltaMinor: 0 }), (error) => error.code === "permission-denied");
  await assert.rejects((await import("firebase/firestore")).deleteDoc(originalEventRef), (error) => error.code === "permission-denied");
  await assert.rejects((await import("firebase/firestore")).deleteDoc(movementRef), (error) => error.code === "permission-denied");
});
