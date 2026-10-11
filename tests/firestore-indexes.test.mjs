import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../firestore.indexes.json", import.meta.url), "utf8"));
const indexes = config.indexes.map((index) => ({
  collection: index.collectionGroup,
  fields: index.fields.map(({ fieldPath, order }) => [fieldPath, order]),
}));

const indexKey = (collection, fields) => `${collection}|${fields.map(([field, order]) => `${field}:${order}`).join(",")}`;
const expected = new Set();
function requireIndex(collection, fields) {
  expected.add(indexKey(collection, fields));
}

const asc = (...fields) => fields.map((field) => [field, "ASCENDING"]);
const dateDesc = (fields) => [...fields.map((field) => [field, "ASCENDING"]), ["fecha", "DESCENDING"]];
const effectiveDateAsc = (fields) => [...fields.map((field) => [field, "ASCENDING"]), ["fechaEfectiva", "ASCENDING"]];

test("conserva los índices de informes y agregados usados por el cliente", () => {
  requireIndex("movimientos", [["moneda", "ASCENDING"], ["fecha", "DESCENDING"]]);
  requireIndex("movimientos", [...asc("moneda", "tipo"), ["fecha", "ASCENDING"], ["montoMinor", "ASCENDING"]]);
  requireIndex("movimientos", [...asc("tipo", "moneda"), ["fecha", "ASCENDING"]]);
  // Se conserva el índice remoto previo para clientes todavía activos y el nuevo agregado local.
  requireIndex("movimientos", [...asc("tipo", "categoria_id", "moneda"), ["fecha", "ASCENDING"]]);
  requireIndex("movimientos", [...asc("tipo", "categoria_id", "moneda"), ["fecha", "ASCENDING"], ["montoMinor", "ASCENDING"]]);
  requireIndex("transferencias", [["moneda", "ASCENDING"], ["fecha", "DESCENDING"]]);
  requireIndex("pagosTarjeta", [["moneda", "ASCENDING"], ["fecha", "DESCENDING"]]);
  requireIndex("presupuestos", [["moneda", "ASCENDING"], ["mes", "DESCENDING"]]);
});

test("cubre todas las combinaciones de filtros visibles de movimientos", () => {
  const filters = ["tipo", "categoria_id", "persona_id"];
  for (let mask = 1; mask < 2 ** filters.length; mask++) {
    const selected = filters.filter((_, bit) => mask & (1 << bit));
    requireIndex("movimientos", dateDesc(selected));
  }

  // El filtro de cuenta se añade después de los filtros de la forma en app.js.
  for (let mask = 0; mask < 2 ** filters.length; mask++) {
    const selected = filters.filter((_, bit) => mask & (1 << bit));
    requireIndex("movimientos", dateDesc([...selected, "cuenta_id"]));
  }
});

test("cubre eventos contables de flujo, reportes, línea base e intereses", () => {
  requireIndex("eventosContables", [["moneda", "ASCENDING"], ["fechaEfectiva", "DESCENDING"]]);
  requireIndex("eventosContables", [["moneda", "ASCENDING"], ["fechaEfectiva", "ASCENDING"]]);
  requireIndex("eventosContables", [["eventoTipo", "ASCENDING"], ["fechaEfectiva", "DESCENDING"]]);
  requireIndex("eventosContables", effectiveDateAsc(["eventoTipo", "moneda"]));
  requireIndex("eventosContables", asc("cuentaId", "eventoTipo"));
});

test("cubre las consultas filtradas de transferencias y pagos de tarjeta", () => {
  requireIndex("transferencias", [["cuenta_origen_id", "ASCENDING"], ["fecha", "DESCENDING"]]);
  requireIndex("transferencias", [["cuenta_destino_id", "ASCENDING"], ["fecha", "DESCENDING"]]);
  requireIndex("pagosTarjeta", [["cuenta_id", "ASCENDING"], ["fecha", "DESCENDING"]]);
});

test("no conserva composites sin consulta correspondiente en el cliente", () => {
  const actual = new Set(indexes.map(({ collection, fields }) => indexKey(collection, fields)));
  assert.deepEqual([...actual].sort(), [...expected].sort());
  assert.equal(config.indexes.length, expected.size);
});
