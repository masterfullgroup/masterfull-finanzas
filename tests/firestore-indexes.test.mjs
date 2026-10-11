import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../firestore.indexes.json", import.meta.url), "utf8"));
const indexes = config.indexes.map((index) => ({
  collection: index.collectionGroup,
  fields: index.fields.map(({ fieldPath, order }) => [fieldPath, order]),
}));

function hasIndex(collection, fields) {
  return indexes.some((index) => index.collection === collection
    && fields.every(([field, order], position) => index.fields[position]?.[0] === field && index.fields[position]?.[1] === order));
}

test("event report and monthly balance queries have matching composites", () => {
  assert.ok(hasIndex("eventosContables", [["moneda", "ASCENDING"], ["fechaEfectiva", "DESCENDING"]]));
  assert.ok(hasIndex("eventosContables", [["moneda", "ASCENDING"], ["fechaEfectiva", "ASCENDING"]]));
  assert.ok(hasIndex("eventosContables", [["eventoTipo", "ASCENDING"], ["fechaEfectiva", "DESCENDING"]]));
  assert.ok(hasIndex("eventosContables", [["cuentaId", "ASCENDING"], ["eventoTipo", "ASCENDING"]]));
  assert.ok(hasIndex("eventosContables", [["deudaId", "ASCENDING"], ["fechaEfectiva", "DESCENDING"]]));
});

test("debt fee aggregates and legacy operation reports have matching composites", () => {
  assert.ok(hasIndex("eventosContables", [["eventoTipo", "ASCENDING"], ["moneda", "ASCENDING"], ["fechaEfectiva", "ASCENDING"]]));
  for (const collection of ["movimientos", "transferencias", "pagosTarjeta"]) {
    assert.ok(hasIndex(collection, [["moneda", "ASCENDING"], ["fecha", "DESCENDING"]]));
  }
});
