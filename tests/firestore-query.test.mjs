import test from "node:test";
import assert from "node:assert/strict";
import { buildEntityPageOptions, firestoreQueryContext, retryFirestoreRead } from "../js/firestore-query.js";

const staleMovementState = {
  filter: {
    equals: { tipo: "GASTO", categoria_id: "private-category-id" },
    startDate: "2026-10-01",
    endDate: "2026-10-31",
  },
  movementAccountFilter: "private-account-id",
  entityCursor: { id: "last-document" },
};

test("non-movement modules never inherit movement filters or date ranges", () => {
  const modules = [
    "cuentas", "tarjetas", "deudas", "transferencias", "pagosTarjeta", "personas",
    "propietarios", "instituciones", "categorias", "presupuestos", "metas", "recurrentes",
  ];
  for (const entity of modules) {
    const options = buildEntityPageOptions({ entity, state: staleMovementState, append: false, pageSize: 50 });
    assert.deepEqual(options.equals, {}, `${entity} must not inherit tipo, category, or account filters`);
    if (!["transferencias", "pagosTarjeta"].includes(entity)) {
      assert.equal(options.startDate, undefined, `${entity} must not inherit movement dates`);
      assert.equal(options.endDate, undefined, `${entity} must not inherit movement dates`);
    }
  }
});

test("income and expense views keep their movement filters and pagination", () => {
  const options = buildEntityPageOptions({ entity: "movimientos", state: staleMovementState, append: true, pageSize: 50 });
  assert.deepEqual(options.equals, {
    tipo: "GASTO",
    categoria_id: "private-category-id",
    cuenta_id: "private-account-id",
  });
  assert.equal(options.startDate, "2026-10-01");
  assert.equal(options.endDate, "2026-10-31");
  assert.equal(options.cursor, staleMovementState.entityCursor);
  assert.equal(options.orderField, "fecha");
});

test("transfer and card payment views keep date filters but drop stale movement filters", () => {
  for (const entity of ["transferencias", "pagosTarjeta"]) {
    const options = buildEntityPageOptions({ entity, state: staleMovementState, append: false, pageSize: 50 });
    assert.deepEqual(options.equals, {});
    assert.equal(options.startDate, "2026-10-01");
    assert.equal(options.endDate, "2026-10-31");
    assert.equal(options.orderField, "fecha");
  }
});

test("query diagnostics include route and parameters while hiding user record IDs", () => {
  const context = firestoreQueryContext("categorias", {
    limit: 50,
    orderField: "createdAt",
    direction: "desc",
    equals: { tipo: "GASTO", categoria_id: "private-category-id" },
  }, { code: "firestore/failed-precondition" });
  assert.deepEqual(context, {
    code: "failed-precondition",
    route: "#categorias",
    path: "users/{uid}/categorias",
    parameters: {
      equals: { tipo: "GASTO", categoria_id: "[id oculto]" },
      orderBy: { field: "createdAt", direction: "desc" },
      startAfter: false,
      limit: 50,
    },
    attempts: 1,
  });
});

test("transient Firestore read failures retry at most twice", async () => {
  let calls = 0;
  const delays = [];
  const result = await retryFirestoreRead(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("temporary"), { code: "firestore/unavailable" });
    return "ok";
  }, { wait: async (delay) => delays.push(delay) });
  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [150, 300]);
});

test("failed-precondition and permission errors are never retried", async () => {
  for (const code of ["failed-precondition", "permission-denied"]) {
    let calls = 0;
    await assert.rejects(retryFirestoreRead(async () => {
      calls += 1;
      throw Object.assign(new Error("permanent"), { code });
    }, { wait: async () => assert.fail("permanent errors must not be retried") }), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.readAttempts, 1);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("exhausted transient retries stop after three attempts", async () => {
  let calls = 0;
  await assert.rejects(retryFirestoreRead(async () => {
    calls += 1;
    throw Object.assign(new Error("offline"), { code: "unavailable" });
  }, { wait: async () => {} }), (error) => {
    assert.equal(error.readAttempts, 3);
    return true;
  });
  assert.equal(calls, 3);
});
