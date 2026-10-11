import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dataModule = await readFile(new URL("../js/data.js", import.meta.url), "utf8");

test("el cliente optimizado anula operaciones con eventos y no las borra físicamente", () => {
  const start = dataModule.indexOf("export async function deleteLedgerEntry");
  const end = dataModule.indexOf("export function sanitizeFileName", start);
  assert.ok(start >= 0 && end > start, "debe existir la función central de anulación");
  const body = dataModule.slice(start, end);
  assert.match(body, /operationType: "REVERSIÓN"/);
  assert.match(body, /appendAccountingEvent\(/);
  assert.match(body, /eventoAnulacionId/);
  assert.match(body, /transaction\.update\(docRef/);
  assert.doesNotMatch(body, /transaction\.delete|deleteDoc\(/);
});

test("cuentas, tarjetas y deudas se archivan en vez de eliminarse", () => {
  const start = dataModule.indexOf("export async function removeDocument");
  const end = dataModule.indexOf("export async function ensureUserProfile", start);
  const body = dataModule.slice(start, end);
  assert.match(body, /name === "cuentas"\) transaction\.update\(targetRef, \{ estado: "ARCHIVADA"/);
  assert.match(body, /name === "deudas"/);
  assert.match(body, /name === "tarjetas"/);
  assert.match(body, /transaction\.delete\(targetRef\)/, "el borrado restante se limita a datos de referencia");
});
