import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const start = source.indexOf("const NAV = [");
const end = source.indexOf("\n];", start);
const navSource = source.slice(start, end);
const links = [...navSource.matchAll(/\["([^\"]+)",\s*"[^\"]+",\s*"([^\"]+)"(?:,\s*"([^\"]+)")?\]/g)]
  .map(([, page, label, movementType]) => ({ page, label, movementType }));
const supportedPages = new Set([
  "resumen", "movimientos", "cuentas", "tarjetas", "deudas", "transferencias", "pagosTarjeta",
  "personas", "propietarios", "instituciones", "categorias", "presupuestos", "metas", "recurrentes",
  "flujo", "reportes", "perfil",
]);
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const signOutHandlers = [...source.matchAll(/services\.authSdk\.signOut\(services\.auth\)/g)];

test("the 19 navigation links and the sidebar sign-out action account for 20 sidebar options", () => {
  assert.equal(links.length, 19);
  assert.equal(new Set(links.map(({ page }) => page)).size, 17, "Income, expense, and all movements are distinct options for the same movements view.");
  assert.ok(links.every(({ page }) => supportedPages.has(page)));
  assert.deepEqual(links.filter(({ movementType }) => movementType).map(({ movementType }) => movementType), ["INGRESO", "GASTO"]);
  assert.match(html, /<button id="logout"[^>]*aria-label="Cerrar sesión"/);
  assert.equal(links.length + 1, 20);
});

test("profile shortcuts resolve to the profile route and both sign-out controls are wired", () => {
  assert.match(html, /<a href="#perfil"[^>]*>.*?Mi perfil/s);
  assert.match(html, /<button id="profile-menu-logout"[^>]*>.*?Cerrar sesión/s);
  assert.equal(signOutHandlers.length, 2);
});
