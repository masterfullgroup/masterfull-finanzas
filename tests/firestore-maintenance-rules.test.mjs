import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

const projectId = "demo-masterfull-local";
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL("../firestore.rules.maintenance", import.meta.url), "utf8") },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users/alice"), { displayName: "Ficticio", createdAt: serverTimestamp() });
    await setDoc(doc(db, "users/alice/movimientos/legacy-operation"), { tipo: "INGRESO", montoMinor: 1000 });
    await setDoc(doc(db, "users/alice/eventosContables/immutable-event"), { eventoTipo: "MOVIMIENTO" });
  });
});

after(async () => environment.cleanup());

test("mantenimiento conserva lectura propia y bloquea toda escritura, incluso borrados financieros", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  const profile = doc(db, "users/alice");
  const movement = doc(db, "users/alice/movimientos/legacy-operation");
  const event = doc(db, "users/alice/eventosContables/immutable-event");

  assert.equal((await getDoc(profile)).exists(), true);
  assert.equal((await getDoc(movement)).exists(), true);
  assert.equal((await getDoc(event)).exists(), true);
  await assert.rejects(setDoc(doc(db, "users/alice/movimientos/new"), { montoMinor: 2000 }));
  await assert.rejects(updateDoc(movement, { montoMinor: 2000 }));
  await assert.rejects(deleteDoc(movement));
  await assert.rejects(updateDoc(event, { eventoTipo: "AJUSTE" }));
  await assert.rejects(deleteDoc(event));
});

test("mantenimiento no amplía lecturas a otros usuarios ni a anónimos", async () => {
  const bob = environment.authenticatedContext("bob").firestore();
  const anonymous = environment.unauthenticatedContext().firestore();
  await assert.rejects(getDoc(doc(bob, "users/alice/movimientos/legacy-operation")));
  await assert.rejects(getDoc(doc(anonymous, "users/alice/movimientos/legacy-operation")));
});
