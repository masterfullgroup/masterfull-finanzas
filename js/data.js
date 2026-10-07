import { firebaseStorageAvailable, getFirebaseServices } from "./firebase.js";
import { currencyDigits, fromMinorUnits, toMinorUnits } from "./finance.js";

const MONEY_FIELDS = {
  cuentas: { saldo_inicial: "saldoInicialMinor", saldo_actual: "saldoActualMinor" },
  tarjetas: { linea_credito: "lineaCreditoMinor", saldo_inicial_usado: "saldoInicialUsadoMinor", utilizado: "utilizadoMinor" },
  movimientos: { monto: "montoMinor" },
  transferencias: { monto: "montoMinor" },
  pagosTarjeta: { monto: "montoMinor" },
  presupuestos: { limite: "limiteMinor" },
  metas: { monto_objetivo: "montoObjetivoMinor", monto_actual: "montoActualMinor" },
  deudas: { monto_total: "montoTotalMinor", monto_pagado: "montoPagadoMinor" },
  recurrentes: { monto_estimado: "montoEstimadoMinor" },
};

const collectionPath = (uid, name) => ["users", uid, name];
const collectionRef = async (uid, name) => {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  return fs.collection(db, ...collectionPath(uid, name));
};

function encode(uid, name, input) {
  const { id, ...source } = input;
  const data = { ...source };
  for (const [uiField, storedField] of Object.entries(MONEY_FIELDS[name] || {})) {
    if (!(uiField in data)) continue;
    const amount = Number(data[uiField] || 0);
    const currency = data.moneda || "PEN";
    data[storedField] = toMinorUnits(amount, currency);
    delete data[uiField];
  }
  data.updatedAt = new Date();
  if (!input.createdAt) data.createdAt = new Date();
  return data;
}

function decode(name, id, raw) {
  const data = { id, ...raw };
  for (const [uiField, storedField] of Object.entries(MONEY_FIELDS[name] || {})) {
    if (storedField in data) {
      data[uiField] = fromMinorUnits(data[storedField], data.moneda || "PEN");
    }
  }
  return data;
}

function requireSnapshots(snapshots, label) {
  if (snapshots.some((snapshot) => !snapshot.exists())) throw new Error(`La ${label} vinculada ya no existe. Actualiza la pantalla e inténtalo de nuevo.`);
}

function addFilters(fs, ref, filters = {}) {
  const constraints = [];
  for (const [field, value] of Object.entries(filters.equals || {})) {
    if (value !== "" && value != null) constraints.push(fs.where(field, "==", value));
  }
  if (filters.startDate) constraints.push(fs.where("fecha", ">=", filters.startDate));
  if (filters.endDate) constraints.push(fs.where("fecha", "<=", filters.endDate));
  const orderField = filters.orderField || "createdAt";
  constraints.push(fs.orderBy(orderField, filters.direction || "desc"));
  if (filters.cursor) constraints.push(fs.startAfter(filters.cursor));
  constraints.push(fs.limit(Math.min(Math.max(filters.limit || 50, 1), 500)));
  return fs.query(ref, ...constraints);
}

export async function listPage(uid, name, options = {}) {
  const { firestoreSdk: fs } = await getFirebaseServices();
  const ref = await collectionRef(uid, name);
  const snapshot = await fs.getDocs(addFilters(fs, ref, options));
  return {
    rows: snapshot.docs.map((doc) => decode(name, doc.id, doc.data())),
    cursor: snapshot.docs.at(-1) || null,
    hasMore: snapshot.size === Math.min(Math.max(options.limit || 50, 1), 500),
  };
}

export async function getDocument(uid, name, id) {
  const { firestoreSdk: fs } = await getFirebaseServices();
  const ref = await fs.doc(await collectionRef(uid, name), id);
  const snapshot = await fs.getDoc(ref);
  return snapshot.exists() ? decode(name, snapshot.id, snapshot.data()) : null;
}

export async function saveDocument(uid, name, value, id = value.id || null) {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  const ref = await collectionRef(uid, name);
  const docRef = id ? fs.doc(ref, id) : fs.doc(ref);
  const data = encode(uid, name, value);
  if (id && name === "cuentas" && data.saldoInicialMinor !== undefined) {
    await fs.runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(docRef);
      if (!snapshot.exists()) throw new Error("La cuenta ya no existe. Actualiza la pantalla.");
      const previous = snapshot.data();
      const delta = data.saldoInicialMinor - Number(previous.saldoInicialMinor || 0);
      transaction.update(docRef, { ...data, saldoActualMinor: Number(previous.saldoActualMinor ?? previous.saldoInicialMinor ?? 0) + delta, createdAt: previous.createdAt, updatedAt: fs.serverTimestamp() });
    });
  } else if (id && name === "tarjetas" && data.saldoInicialUsadoMinor !== undefined) {
    await fs.runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(docRef);
      if (!snapshot.exists()) throw new Error("La tarjeta ya no existe. Actualiza la pantalla.");
      const previous = snapshot.data();
      const delta = data.saldoInicialUsadoMinor - Number(previous.saldoInicialUsadoMinor || 0);
      transaction.update(docRef, { ...data, utilizadoMinor: Math.max(0, Number(previous.utilizadoMinor ?? previous.saldoInicialUsadoMinor ?? 0) + delta), createdAt: previous.createdAt, updatedAt: fs.serverTimestamp() });
    });
  } else if (id) await fs.updateDoc(docRef, data);
  else await fs.setDoc(docRef, { ...data, createdAt: fs.serverTimestamp() });
  return decode(name, docRef.id, { ...data, ...(id ? {} : { createdAt: new Date() }) });
}

export async function removeDocument(uid, name, id) {
  const { firestoreSdk: fs } = await getFirebaseServices();
  const references = {
    cuentas: [["movimientos", "cuenta_id"], ["transferencias", "cuenta_origen_id"], ["transferencias", "cuenta_destino_id"], ["pagosTarjeta", "cuenta_id"], ["tarjetas", "cuenta_id"]],
    tarjetas: [["movimientos", "tarjeta_id"], ["pagosTarjeta", "tarjeta_id"], ["recurrentes", "tarjeta_id"]],
    propietarios: [["cuentas", "propietario_id"]],
    instituciones: [["cuentas", "institucion_id"]],
    categorias: [["movimientos", "categoria_id"], ["presupuestos", "categoria_id"], ["recurrentes", "categoria_id"]],
  }[name] || [];
  const matches = await Promise.all(references.map(async ([collection, field]) => {
    const ref = await collectionRef(uid, collection);
    const result = await fs.getDocs(fs.query(ref, fs.where(field, "==", id), fs.limit(1)));
    return !result.empty;
  }));
  if (matches.some(Boolean)) throw new Error("No se puede eliminar: otros registros dependen de este elemento. Actualiza o elimina primero esos vínculos.");
  await fs.deleteDoc(fs.doc(await collectionRef(uid, name), id));
}

export async function ensureUserProfile(user) {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  const ref = fs.doc(db, "users", user.uid);
  const snapshot = await fs.getDoc(ref);
  if (!snapshot.exists()) {
    await fs.setDoc(ref, {
      displayName: user.displayName || "",
      email: user.email || "",
      currency: "PEN",
      timeZone: "America/Lima",
      createdAt: fs.serverTimestamp(),
      updatedAt: fs.serverTimestamp(),
    });
  } else if ((snapshot.data().email || "") !== (user.email || "")) {
    await fs.updateDoc(ref, { email: user.email || "", updatedAt: fs.serverTimestamp() });
  }
}

export async function updateUserProfile(user, values) {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  await fs.setDoc(fs.doc(db, "users", user.uid), {
    displayName: values.displayName.trim(),
    email: user.email || "",
    currency: values.currency || "PEN",
    timeZone: "America/Lima",
    updatedAt: fs.serverTimestamp(),
  }, { merge: true });
}

export async function getProfile(uid) {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  const snapshot = await fs.getDoc(fs.doc(db, "users", uid));
  return snapshot.exists() ? snapshot.data() : {};
}

export async function monthTotals(uid, startDate, endDate, currency = "PEN") {
  const { firestoreSdk: fs } = await getFirebaseServices();
  const ref = await collectionRef(uid, "movimientos");
  const totals = await Promise.all(["INGRESO", "GASTO"].map(async (tipo) => {
    const filtered = fs.query(ref, fs.where("tipo", "==", tipo), fs.where("moneda", "==", currency), fs.where("fecha", ">=", startDate), fs.where("fecha", "<=", endDate));
    const snapshot = await fs.getAggregateFromServer(filtered, { total: fs.sum("montoMinor"), count: fs.count() });
    return snapshot.data();
  }));
  return {
    incomeMinor: Number(totals[0].total || 0),
    expenseMinor: Number(totals[1].total || 0),
    incomeCount: Number(totals[0].count || 0),
    expenseCount: Number(totals[1].count || 0),
  };
}

export async function categoryExpenseTotal(uid, categoryId, startDate, endDate, currency = "PEN") {
  const { firestoreSdk: fs } = await getFirebaseServices();
  const ref = await collectionRef(uid, "movimientos");
  const filtered = fs.query(ref,
    fs.where("tipo", "==", "GASTO"),
    fs.where("categoria_id", "==", categoryId),
    fs.where("moneda", "==", currency),
    fs.where("fecha", ">=", startDate),
    fs.where("fecha", "<=", endDate));
  const snapshot = await fs.getAggregateFromServer(filtered, { total: fs.sum("montoMinor") });
  return Number(snapshot.data().total || 0);
}

export async function saveLedgerEntry(uid, collectionName, value, id = value.id || null, previous = null) {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  const ref = await collectionRef(uid, collectionName);
  const docRef = id ? fs.doc(ref, id) : fs.doc(ref);
  const data = encode(uid, collectionName, value);

  if (collectionName === "transferencias") {
    if (!value.cuenta_origen_id || !value.cuenta_destino_id || value.cuenta_origen_id === value.cuenta_destino_id) {
      throw new Error("Selecciona dos cuentas distintas para la transferencia.");
    }
    const amount = toMinorUnits(value.monto, value.moneda || "PEN");
    const old = previous ? { from: previous.cuenta_origen_id, to: previous.cuenta_destino_id, amount: toMinorUnits(previous.monto, previous.moneda || "PEN") } : null;
    await fs.runTransaction(db, async (transaction) => {
      const ids = [...new Set([value.cuenta_origen_id, value.cuenta_destino_id, old?.from, old?.to].filter(Boolean))];
      const accountRefs = ids.map((accountId) => fs.doc(db, ...collectionPath(uid, "cuentas"), accountId));
      const snapshots = await Promise.all(accountRefs.map((accountRef) => transaction.get(accountRef)));
      requireSnapshots(snapshots, "cuenta");
      if (snapshots.some((snapshot) => snapshot.data().moneda !== value.moneda)) throw new Error("Las cuentas y la transferencia deben usar la misma moneda.");
      const balanceChanges = new Map(ids.map((accountId, index) => [accountId, Number(snapshots[index].data()?.saldoActualMinor ?? snapshots[index].data()?.saldoInicialMinor ?? 0)]));
      if (old) { balanceChanges.set(old.from, balanceChanges.get(old.from) + old.amount); balanceChanges.set(old.to, balanceChanges.get(old.to) - old.amount); }
      balanceChanges.set(value.cuenta_origen_id, balanceChanges.get(value.cuenta_origen_id) - amount);
      balanceChanges.set(value.cuenta_destino_id, balanceChanges.get(value.cuenta_destino_id) + amount);
      transaction.set(docRef, { ...data, montoMinor: amount, createdAt: previous?.createdAt || fs.serverTimestamp() });
      for (const accountId of ids) transaction.update(accountRefs[ids.indexOf(accountId)], { saldoActualMinor: balanceChanges.get(accountId), updatedAt: fs.serverTimestamp() });
    });
  } else if (collectionName === "pagosTarjeta") {
    const amount = toMinorUnits(value.monto, value.moneda || "PEN");
    const old = previous ? { card: previous.tarjeta_id, account: previous.cuenta_id, amount: toMinorUnits(previous.monto, previous.moneda || "PEN") } : null;
    await fs.runTransaction(db, async (transaction) => {
      const accountIds = [...new Set([value.cuenta_id, old?.account].filter(Boolean))];
      const cardIds = [...new Set([value.tarjeta_id, old?.card].filter(Boolean))];
      const accountRefs = accountIds.map((accountId) => fs.doc(db, ...collectionPath(uid, "cuentas"), accountId));
      const cardRefs = cardIds.map((cardId) => fs.doc(db, ...collectionPath(uid, "tarjetas"), cardId));
      const snapshots = await Promise.all([...accountRefs, ...cardRefs].map((documentRef) => transaction.get(documentRef)));
      requireSnapshots(snapshots, "cuenta o tarjeta");
      if ([...snapshots.slice(0, accountRefs.length), ...snapshots.slice(accountRefs.length)].some((snapshot) => snapshot.data().moneda !== value.moneda)) throw new Error("La tarjeta, la cuenta y el pago deben usar la misma moneda.");
      const accountChanges = new Map(accountIds.map((accountId, index) => [accountId, Number(snapshots[index].data()?.saldoActualMinor ?? snapshots[index].data()?.saldoInicialMinor ?? 0)]));
      const cardChanges = new Map(cardIds.map((cardId, index) => [cardId, Number(snapshots[accountRefs.length + index].data()?.utilizadoMinor ?? snapshots[accountRefs.length + index].data()?.saldoInicialUsadoMinor ?? 0)]));
      if (old) { accountChanges.set(old.account, accountChanges.get(old.account) + old.amount); cardChanges.set(old.card, cardChanges.get(old.card) + old.amount); }
      accountChanges.set(value.cuenta_id, accountChanges.get(value.cuenta_id) - amount);
      cardChanges.set(value.tarjeta_id, Math.max(0, cardChanges.get(value.tarjeta_id) - amount));
      transaction.set(docRef, { ...data, montoMinor: amount, createdAt: previous?.createdAt || fs.serverTimestamp() });
      accountIds.forEach((accountId, index) => transaction.update(accountRefs[index], { saldoActualMinor: accountChanges.get(accountId), updatedAt: fs.serverTimestamp() }));
      cardIds.forEach((cardId, index) => transaction.update(cardRefs[index], { utilizadoMinor: cardChanges.get(cardId), updatedAt: fs.serverTimestamp() }));
    });
  } else {
    throw new Error("Tipo de operación contable no compatible.");
  }
  return docRef.id;
}

export async function saveMovement(uid, value, id = value.id || null, previous = null) {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  const ref = await collectionRef(uid, "movimientos");
  const docRef = id ? fs.doc(ref, id) : fs.doc(ref);
  const data = encode(uid, "movimientos", value);
  const amount = toMinorUnits(value.monto, value.moneda || "PEN");
  const old = previous ? {
    accountId: previous.cuenta_id || null,
    cardId: previous.tarjeta_id || null,
    delta: (previous.tipo === "INGRESO" ? 1 : -1) * toMinorUnits(previous.monto, previous.moneda || "PEN"),
    cardDelta: previous.medio_pago === "TARJETA_CREDITO" && previous.tipo === "GASTO" ? toMinorUnits(previous.monto, previous.moneda || "PEN") : 0,
  } : null;
  const current = {
    accountId: value.cuenta_id || null,
    cardId: value.tarjeta_id || null,
    delta: (value.tipo === "INGRESO" ? 1 : -1) * amount,
    cardDelta: value.medio_pago === "TARJETA_CREDITO" && value.tipo === "GASTO" ? amount : 0,
  };
  await fs.runTransaction(db, async (transaction) => {
    const accountIds = [...new Set([old?.accountId, current.accountId].filter(Boolean))];
    const cardIds = [...new Set([old?.cardId, current.cardId].filter(Boolean))];
    const accountRefs = accountIds.map((accountId) => fs.doc(db, ...collectionPath(uid, "cuentas"), accountId));
    const cardRefs = cardIds.map((cardId) => fs.doc(db, ...collectionPath(uid, "tarjetas"), cardId));
    const snapshots = await Promise.all([...accountRefs, ...cardRefs].map((documentRef) => transaction.get(documentRef)));
    requireSnapshots(snapshots, "cuenta o tarjeta");
    accountIds.forEach((accountId, index) => {
      if (accountId === current.accountId && snapshots[index].data().moneda !== value.moneda) throw new Error("La cuenta y el movimiento deben usar la misma moneda.");
    });
    cardIds.forEach((cardId, index) => {
      if (cardId === current.cardId && snapshots[accountRefs.length + index].data().moneda !== value.moneda) throw new Error("La tarjeta y el movimiento deben usar la misma moneda.");
    });
    const accountChanges = new Map(accountIds.map((accountId, index) => [accountId, Number(snapshots[index].data()?.saldoActualMinor ?? snapshots[index].data()?.saldoInicialMinor ?? 0)]));
    const cardChanges = new Map(cardIds.map((cardId, index) => [cardId, Number(snapshots[accountRefs.length + index].data()?.utilizadoMinor ?? snapshots[accountRefs.length + index].data()?.saldoInicialUsadoMinor ?? 0)]));
    if (old?.accountId) accountChanges.set(old.accountId, accountChanges.get(old.accountId) - old.delta);
    if (old?.cardId && old.cardDelta) cardChanges.set(old.cardId, cardChanges.get(old.cardId) - old.cardDelta);
    if (current.accountId) accountChanges.set(current.accountId, accountChanges.get(current.accountId) + current.delta);
    if (current.cardId && current.cardDelta) cardChanges.set(current.cardId, cardChanges.get(current.cardId) + current.cardDelta);
    transaction.set(docRef, { ...data, montoMinor: amount, createdAt: previous?.createdAt || fs.serverTimestamp() });
    accountIds.forEach((accountId, index) => transaction.update(accountRefs[index], { saldoActualMinor: accountChanges.get(accountId), updatedAt: fs.serverTimestamp() }));
    cardIds.forEach((cardId, index) => transaction.update(cardRefs[index], { utilizadoMinor: Math.max(0, cardChanges.get(cardId)), updatedAt: fs.serverTimestamp() }));
  });
  return docRef.id;
}

export async function deleteLedgerEntry(uid, collectionName, id, previous) {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  const docRef = fs.doc(db, ...collectionPath(uid, collectionName), id);
  await fs.runTransaction(db, async (transaction) => {
    const accountIds = collectionName === "transferencias"
      ? [previous.cuenta_origen_id, previous.cuenta_destino_id]
      : collectionName === "pagosTarjeta" ? [previous.cuenta_id] : [previous.cuenta_id].filter(Boolean);
    const cardIds = collectionName === "pagosTarjeta" ? [previous.tarjeta_id] : collectionName === "movimientos" && previous.tarjeta_id ? [previous.tarjeta_id] : [];
    const accountRefs = [...new Set(accountIds.filter(Boolean))].map((accountId) => fs.doc(db, ...collectionPath(uid, "cuentas"), accountId));
    const cardRefs = [...new Set(cardIds.filter(Boolean))].map((cardId) => fs.doc(db, ...collectionPath(uid, "tarjetas"), cardId));
    const snapshots = await Promise.all([transaction.get(docRef), ...accountRefs.map((item) => transaction.get(item)), ...cardRefs.map((item) => transaction.get(item))]);
    if (!snapshots[0].exists()) throw new Error("El movimiento ya no existe. Actualiza la pantalla.");
    requireSnapshots(snapshots.slice(1), "cuenta o tarjeta");
    const accountDocs = snapshots.slice(1, 1 + accountRefs.length);
    const cardDocs = snapshots.slice(1 + accountRefs.length);
    if (collectionName === "transferencias") {
      const amount = toMinorUnits(previous.monto, previous.moneda || "PEN");
      transaction.update(accountRefs[0], { saldoActualMinor: Number(accountDocs[0].data()?.saldoActualMinor || 0) + amount });
      transaction.update(accountRefs[1], { saldoActualMinor: Number(accountDocs[1].data()?.saldoActualMinor || 0) - amount });
    } else if (collectionName === "pagosTarjeta") {
      const amount = toMinorUnits(previous.monto, previous.moneda || "PEN");
      transaction.update(accountRefs[0], { saldoActualMinor: Number(accountDocs[0].data()?.saldoActualMinor || 0) + amount });
      transaction.update(cardRefs[0], { utilizadoMinor: Number(cardDocs[0].data()?.utilizadoMinor || 0) + amount });
    } else if (collectionName === "movimientos") {
      const amount = toMinorUnits(previous.monto, previous.moneda || "PEN");
      if (accountRefs.length) transaction.update(accountRefs[0], { saldoActualMinor: Number(accountDocs[0].data()?.saldoActualMinor || 0) - (previous.tipo === "INGRESO" ? amount : -amount) });
      if (cardRefs.length && previous.medio_pago === "TARJETA_CREDITO") transaction.update(cardRefs[0], { utilizadoMinor: Math.max(0, Number(cardDocs[0].data()?.utilizadoMinor || 0) - amount) });
    }
    transaction.delete(docRef);
  });
}

export function sanitizeFileName(name) {
  return name.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-120) || "comprobante";
}

export function attachmentPath(uid, movementId, fileName) {
  return `users/${uid}/comprobantes/${movementId}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}

export async function uploadReceipt(uid, movementId, file) {
  if (!file) return null;
  if (!firebaseStorageAvailable) throw new Error("Los comprobantes no están disponibles temporalmente porque Firebase Storage está desactivado.");
  if (file.size > 10 * 1024 * 1024) throw new Error("El comprobante no debe superar 10 MB.");
  if (!(file.type.startsWith("image/") || file.type === "application/pdf")) throw new Error("Adjunta una imagen o un PDF.");
  const { storage, storageSdk } = await getFirebaseServices();
  const path = attachmentPath(uid, movementId, file.name);
  await storageSdk.uploadBytes(storageSdk.ref(storage, path), file, { contentType: file.type });
  return { path, name: sanitizeFileName(file.name), contentType: file.type, size: file.size };
}

export async function openReceipt(path) {
  if (!firebaseStorageAvailable) throw new Error("No se puede abrir este comprobante: Firebase Storage está desactivado.");
  const { storage, storageSdk } = await getFirebaseServices();
  const blob = await storageSdk.getBlob(storageSdk.ref(storage, path));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function deleteReceipt(path) {
  if (!path) return;
  if (!firebaseStorageAvailable) throw new Error("No se puede eliminar el archivo: Firebase Storage está desactivado.");
  const { storage, storageSdk } = await getFirebaseServices();
  await storageSdk.deleteObject(storageSdk.ref(storage, path));
}

export const moneyPrecision = currencyDigits;
