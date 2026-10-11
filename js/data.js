import { firebaseStorageAvailable, getFirebaseServices } from "./firebase.js";
import { creditCardDebtDelta, currencyDigits, fromMinorUnits, movementDelta, resolveMovementAccountId, toMinorUnits, validatePaymentAmount, debtPrincipalChange, debtCostEffect, validateDebtPrincipalPayment, confirmedOutstandingPrincipal } from "./finance.js";

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

function accountingEventsRef(db, fs, uid) {
  return fs.collection(db, ...collectionPath(uid, "eventosContables"));
}

function newAccountingEventRef(db, fs, uid) {
  return fs.doc(accountingEventsRef(db, fs, uid));
}

function appendAccountingEvent(transaction, eventRef, fs, event) {
  transaction.set(eventRef, { ...event, registradoEn: fs.serverTimestamp(), creadoEn: fs.serverTimestamp() });
}

function accountingPointer(eventId, operationId) {
  return { ultimoEventoContableId: eventId, ultimaOperacionContableId: operationId };
}

function cashMovementEvent({ operationCollection, operationId, operationType, accountId, currency, effectiveDate, cashDeltaMinor, principalDeltaMinor = 0, impact = "NINGUNO", resultDeltaMinor = null, resultBasisImpact = impact, component = null, relatedEventId = null, reason = null, snapshot = null }) {
  const resultDelta = resultDeltaMinor == null ? (impact === "INGRESO" ? Math.abs(Number(snapshot?.montoMinor || cashDeltaMinor)) : impact === "GASTO" ? -Math.abs(Number(snapshot?.montoMinor || cashDeltaMinor)) : 0) : Number(resultDeltaMinor);
  return {
    cuentaId: accountId || null, deudaId: snapshot?.deuda_id || snapshot?.deudaId || null,
    operacionColeccion: operationCollection, operacionId: operationId,
    eventoTipo: operationType, montoDeltaMinor: Number(cashDeltaMinor || 0), deltaPrincipalMinor: Number(principalDeltaMinor || 0),
    moneda: currency, fechaEfectiva: effectiveDate, impactoResultado: impact,
    deltaResultadoMinor: resultDelta,
    deltaIngresoMinor: resultBasisImpact === "INGRESO" ? resultDelta : 0,
    deltaGastoMinor: resultBasisImpact === "GASTO" ? -resultDelta : 0,
    componenteDeuda: component, eventoRelacionadoId: relatedEventId, motivo: reason,
    operacionSnapshot: snapshot,
  };
}

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
  const dateField = filters.dateField || "fecha";
  if (filters.startDate) constraints.push(fs.where(dateField, ">=", filters.startDate));
  if (filters.endDate) constraints.push(fs.where(dateField, "<=", filters.endDate));
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
    const baselineRef = newAccountingEventRef(db, fs, uid);
    const baselineQuery = fs.query(accountingEventsRef(db, fs, uid), fs.where("cuentaId", "==", id), fs.where("eventoTipo", "==", "SALDO_BASE"), fs.limit(1));
    await fs.runTransaction(db, async (transaction) => {
      const [snapshot, baselineSnapshot] = await Promise.all([transaction.get(docRef), transaction.get(baselineQuery)]);
      if (!snapshot.exists()) throw new Error("La cuenta ya no existe. Actualiza la pantalla.");
      const previous = snapshot.data();
      const stableData = { ...data };
      if (!baselineSnapshot.empty) stableData.fecha_saldo_inicial = baselineSnapshot.docs[0].data().fechaEfectiva;
      const delta = data.saldoInicialMinor - Number(previous.saldoInicialMinor || 0);
      if (delta && baselineSnapshot.empty) throw new Error("No se puede ajustar el saldo inicial sin una línea base confirmada.");
      transaction.update(docRef, { ...stableData, saldoActualMinor: Number(previous.saldoActualMinor ?? previous.saldoInicialMinor ?? 0) + delta, createdAt: previous.createdAt, updatedAt: fs.serverTimestamp() });
      if (!baselineSnapshot.empty && delta) {
        const baseline = baselineSnapshot.docs[0];
        appendAccountingEvent(transaction, baselineRef, fs, cashMovementEvent({
          operationCollection: "cuentas", operationId: id, operationType: "AJUSTE", accountId: id,
          currency: previous.moneda || "PEN", effectiveDate: baseline.data().fechaEfectiva,
          cashDeltaMinor: delta, impact: "NINGUNO", relatedEventId: baseline.id,
          reason: "Ajuste de saldo inicial confirmado", snapshot: { saldoInicialAnteriorMinor: previous.saldoInicialMinor, saldoInicialNuevoMinor: data.saldoInicialMinor },
        }));
        transaction.update(docRef, accountingPointer(baselineRef.id, id));
      }
    });
  } else if (id && name === "tarjetas" && data.saldoInicialUsadoMinor !== undefined) {
    const eventRef = newAccountingEventRef(db, fs, uid);
    await fs.runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(docRef);
      if (!snapshot.exists()) throw new Error("La tarjeta ya no existe. Actualiza la pantalla.");
      const previous = snapshot.data();
      const delta = data.saldoInicialUsadoMinor - Number(previous.saldoInicialUsadoMinor || 0);
      transaction.update(docRef, { ...data, utilizadoMinor: Math.max(0, Number(previous.utilizadoMinor ?? previous.saldoInicialUsadoMinor ?? 0) + delta), createdAt: previous.createdAt, updatedAt: fs.serverTimestamp() });
      if (delta) {
        appendAccountingEvent(transaction, eventRef, fs, cashMovementEvent({ operationCollection: "tarjetas", operationId: id, operationType: "AJUSTE", accountId: null, currency: previous.moneda || "PEN", effectiveDate: data.fecha_saldo_inicial || value.fecha_saldo_inicial || new Date().toISOString().slice(0, 10), cashDeltaMinor: 0, principalDeltaMinor: delta, impact: "NINGUNO", reason: "Ajuste de saldo inicial confirmado", snapshot: { tarjeta_id: id, saldoInicialAnteriorMinor: previous.saldoInicialUsadoMinor || 0, saldoInicialNuevoMinor: data.saldoInicialUsadoMinor } }));
        transaction.update(docRef, accountingPointer(eventRef.id, id));
      }
    });
  } else if (id) await fs.updateDoc(docRef, data);
  else if (name === "cuentas") {
    const baselineRef = newAccountingEventRef(db, fs, uid);
    const balanceMinor = Number(data.saldoInicialMinor || 0);
    if (!Number.isSafeInteger(balanceMinor) || balanceMinor < 0) throw new Error("Confirma un saldo inicial válido para la línea base.");
    await fs.runTransaction(db, async (transaction) => {
      transaction.set(docRef, { ...data, saldoActualMinor: balanceMinor, createdAt: fs.serverTimestamp() });
      appendAccountingEvent(transaction, baselineRef, fs, cashMovementEvent({
        operationCollection: "cuentas", operationId: docRef.id, operationType: "SALDO_BASE", accountId: docRef.id,
        currency: value.moneda || "PEN", effectiveDate: value.fecha_saldo_inicial, cashDeltaMinor: balanceMinor,
        impact: "NINGUNO", snapshot: { saldoConfirmado: true },
      }));
      transaction.update(docRef, accountingPointer(baselineRef.id, docRef.id));
    });
  } else if (name === "tarjetas" && Number(data.saldoInicialUsadoMinor || 0) > 0) {
    const baselineRef = newAccountingEventRef(db, fs, uid);
    await fs.runTransaction(db, async (transaction) => {
      transaction.set(docRef, { ...data, utilizadoMinor: Number(data.saldoInicialUsadoMinor), createdAt: fs.serverTimestamp() });
      appendAccountingEvent(transaction, baselineRef, fs, cashMovementEvent({ operationCollection: "tarjetas", operationId: docRef.id, operationType: "SALDO_BASE", accountId: null, currency: value.moneda || "PEN", effectiveDate: value.fecha_saldo_inicial || new Date().toISOString().slice(0, 10), cashDeltaMinor: 0, principalDeltaMinor: Number(data.saldoInicialUsadoMinor), impact: "NINGUNO", snapshot: { tarjeta_id: docRef.id, saldoConfirmado: true } }));
      transaction.update(docRef, accountingPointer(baselineRef.id, docRef.id));
    });
  } else if (name === "tarjetas") {
    await fs.setDoc(docRef, { ...data, utilizadoMinor: Number(data.saldoInicialUsadoMinor || 0), createdAt: fs.serverTimestamp() });
  } else await fs.setDoc(docRef, { ...data, createdAt: fs.serverTimestamp() });
  return decode(name, docRef.id, { ...data, ...(id ? {} : { createdAt: new Date() }) });
}

export async function saveDebt(uid, value, id = null) {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  const debtsRef = await collectionRef(uid, "deudas");
  const debtRef = id ? fs.doc(debtsRef, id) : fs.doc(debtsRef);
  const prepared = { ...value, principal_confirmado: value.origen_saldo === "PRESTAMO_NUEVO" || value.confirmacion_principal === "SI" };
  delete prepared.confirmacion_principal;
  const data = encode(uid, "deudas", prepared);
  if (!["POR_PAGAR", "POR_COBRAR"].includes(data.tipo_deuda)) throw new Error("La deuda debe estar clasificada como por pagar o por cobrar.");
  if (!id && data.origen_saldo === "PRESTAMO_NUEVO") {
    if (!data.cuenta_id) throw new Error("Selecciona la cuenta que recibió o entregó el préstamo.");
    const accountRef = fs.doc(db, ...collectionPath(uid, "cuentas"), data.cuenta_id);
    const eventRef = newAccountingEventRef(db, fs, uid);
    await fs.runTransaction(db, async (transaction) => {
      const [accountSnapshot, existing] = await Promise.all([transaction.get(accountRef), transaction.get(debtRef)]);
      if (!accountSnapshot.exists()) throw new Error("La cuenta vinculada al préstamo ya no existe.");
      if (existing.exists()) throw new Error("La deuda ya existe. Actualiza la pantalla.");
      const account = accountSnapshot.data();
      if (account.moneda !== value.moneda) throw new Error("La cuenta y el préstamo deben usar la misma moneda.");
      const amountMinor = Number(data.montoTotalMinor || 0);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("El principal debe ser mayor que cero.");
      const cashDeltaMinor = value.tipo_deuda === "POR_PAGAR" ? amountMinor : -amountMinor;
      const balance = Number(account.saldoActualMinor ?? account.saldoInicialMinor ?? 0) + cashDeltaMinor;
      transaction.set(debtRef, { ...data, montoPagadoMinor: 0, estado: "PENDIENTE", createdAt: fs.serverTimestamp() });
      appendAccountingEvent(transaction, eventRef, fs, cashMovementEvent({
        operationCollection: "deudas", operationId: debtRef.id, operationType: "PRESTAMO", accountId: value.cuenta_id,
        currency: value.moneda, effectiveDate: value.fecha_operacion,
        cashDeltaMinor, principalDeltaMinor: amountMinor, impact: "NINGUNO", component: "PRINCIPAL",
        snapshot: { ...data, deuda_id: debtRef.id, montoTotalMinor: amountMinor },
      }));
      transaction.update(debtRef, accountingPointer(eventRef.id, debtRef.id));
      transaction.update(accountRef, { saldoActualMinor: balance, ...accountingPointer(eventRef.id, debtRef.id), updatedAt: fs.serverTimestamp() });
    });
  } else if (id) {
    await fs.runTransaction(db, async (transaction) => {
      const currentSnapshot = await transaction.get(debtRef);
      if (!currentSnapshot.exists()) throw new Error("La deuda ya no existe. Actualiza la pantalla.");
      const previous = currentSnapshot.data();
      if (previous.tipo_deuda && previous.tipo_deuda !== data.tipo_deuda) throw new Error("No se puede cambiar el tipo de una deuda ya clasificada; registra una corrección vinculada.");
      if (data.origen_saldo === "PRESTAMO_NUEVO" && previous.origen_saldo !== "PRESTAMO_NUEVO") throw new Error("Un préstamo histórico no se puede convertir en un desembolso nuevo; clasifícalo como saldo inicial.");
      if (previous.origen_saldo && previous.origen_saldo !== data.origen_saldo) throw new Error("No se puede cambiar el origen de saldo de una deuda existente.");
      if (previous.montoTotalMinor != null && previous.montoTotalMinor !== data.montoTotalMinor) throw new Error("No edites directamente el principal original; registra un ajuste contable vinculado.");
      if (previous.origen_saldo === "PRESTAMO_NUEVO" && previous.cuenta_id !== data.cuenta_id) throw new Error("No cambies la cuenta de un préstamo registrado.");
      if (previous.montoPagadoMinor !== data.montoPagadoMinor) throw new Error("Registra pagos o cobros parciales como operaciones, no editando el total pagado.");
      transaction.update(debtRef, { ...data, createdAt: previous.createdAt, updatedAt: fs.serverTimestamp() });
    });
  } else {
    const effectiveDate = value.fecha_operacion;
    if (!effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error("Indica la fecha efectiva del saldo confirmado.");
    const eventRef = newAccountingEventRef(db, fs, uid);
    await fs.runTransaction(db, async (transaction) => {
      const paidMinor = Number(data.montoPagadoMinor || 0);
      transaction.set(debtRef, {
        ...data, montoPagadoMinor: paidMinor, estado: value.estado || "PENDIENTE",
        ...accountingPointer(eventRef.id, debtRef.id), createdAt: fs.serverTimestamp(),
      });
      appendAccountingEvent(transaction, eventRef, fs, cashMovementEvent({
        operationCollection: "deudas", operationId: debtRef.id, operationType: "SALDO_BASE", accountId: null,
        currency: value.moneda || "PEN", effectiveDate, cashDeltaMinor: 0,
        principalDeltaMinor: data.principal_confirmado ? Number(data.montoTotalMinor || 0) : 0,
        impact: "NINGUNO", component: "PRINCIPAL",
        snapshot: { ...data, deuda_id: debtRef.id, montoTotalMinor: Number(data.montoTotalMinor || 0), saldoConfirmado: Boolean(data.principal_confirmado) },
      }));
    });
  }
  return debtRef.id;
}

export async function establishAccountBaseline(uid, accountId, confirmedBalance, effectiveDate) {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  const accountRef = fs.doc(db, ...collectionPath(uid, "cuentas"), accountId);
  const eventsRef = accountingEventsRef(db, fs, uid);
  if (!effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error("Indica una fecha de corte confirmada.");
  const query = fs.query(eventsRef, fs.where("cuentaId", "==", accountId), fs.where("eventoTipo", "==", "SALDO_BASE"), fs.limit(1));
  let created = true;
  await fs.runTransaction(db, async (transaction) => {
    const [accountSnapshot, existing] = await Promise.all([transaction.get(accountRef), transaction.get(query)]);
    if (!accountSnapshot.exists()) throw new Error("La cuenta no existe.");
    if (!existing.empty) { created = false; return; }
    const amountMinor = toMinorUnits(confirmedBalance, accountSnapshot.data().moneda || "PEN");
    if (amountMinor !== Number(accountSnapshot.data().saldoActualMinor ?? accountSnapshot.data().saldoInicialMinor ?? 0)) throw new Error("El saldo confirmado debe coincidir con el saldo actual guardado; no se alteró la cuenta.");
    const baselineEventRef = newAccountingEventRef(db, fs, uid);
    appendAccountingEvent(transaction, baselineEventRef, fs, cashMovementEvent({
      operationCollection: "cuentas", operationId: accountId, operationType: "SALDO_BASE", accountId,
      currency: accountSnapshot.data().moneda || "PEN", effectiveDate, cashDeltaMinor: amountMinor, impact: "NINGUNO", snapshot: { saldoConfirmado: true },
    }));
    transaction.update(accountRef, accountingPointer(baselineEventRef.id, accountId));
  });
  return created;
}

export async function saveDebtSettlement(uid, debtId, values) {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  const debtRef = fs.doc(db, ...collectionPath(uid, "deudas"), debtId);
  const accountRef = fs.doc(db, ...collectionPath(uid, "cuentas"), values.cuenta_id);
  const eventRefs = [newAccountingEventRef(db, fs, uid), newAccountingEventRef(db, fs, uid), newAccountingEventRef(db, fs, uid)];
  const operationId = eventRefs[0].id;
  const currency = values.moneda || "PEN";
  const principalMinor = toMinorUnits(values.principal || 0, currency);
  const interestMinor = toMinorUnits(values.interes || 0, currency);
  const feeMinor = toMinorUnits(values.comision || 0, currency);
  if (![principalMinor, interestMinor, feeMinor].some((amount) => amount > 0)) throw new Error("Indica principal, interés o comisión mayor que cero.");
  if (principalMinor < 0 || interestMinor < 0 || feeMinor < 0) throw new Error("Los importes no pueden ser negativos.");
  if (!values.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(values.fecha)) throw new Error("Indica la fecha efectiva de la operación.");
  await fs.runTransaction(db, async (transaction) => {
    const [debtSnapshot, accountSnapshot] = await Promise.all([transaction.get(debtRef), transaction.get(accountRef)]);
    requireSnapshots([debtSnapshot, accountSnapshot], "deuda o cuenta");
    const debt = debtSnapshot.data();
    const account = accountSnapshot.data();
    if (!["POR_PAGAR", "POR_COBRAR"].includes(debt.tipo_deuda)) throw new Error("Clasifica la deuda antes de registrar pagos o cobros.");
    if (debt.moneda !== currency || account.moneda !== currency) throw new Error("Deuda, cuenta y operación deben usar la misma moneda.");
    const total = Number(debt.montoTotalMinor || 0);
    const paid = Number(debt.montoPagadoMinor || 0);
    const outstanding = principalMinor ? confirmedOutstandingPrincipal(debt) : 0;
    if (principalMinor) validateDebtPrincipalPayment(principalMinor, outstanding);
    const principal = principalMinor ? debtPrincipalChange({ tipoDeuda: debt.tipo_deuda, operacion: "PAGO_PRINCIPAL", amountMinor: principalMinor }) : { cashDeltaMinor: 0, principalDeltaMinor: 0, impact: "NINGUNO" };
    const interest = interestMinor ? debtCostEffect({ tipoDeuda: debt.tipo_deuda, amountMinor: interestMinor, component: "INTERES" }) : { cashDeltaMinor: 0, impact: "NINGUNO" };
    const fee = feeMinor ? debtCostEffect({ tipoDeuda: debt.tipo_deuda, amountMinor: feeMinor, component: "COMISION" }) : { cashDeltaMinor: 0, impact: "NINGUNO" };
    const cashDelta = principal.cashDeltaMinor + interest.cashDeltaMinor + fee.cashDeltaMinor;
    const newPaid = paid + principalMinor;
    const events = [
      principalMinor ? { index: 0, type: "PAGO_PRINCIPAL", component: "PRINCIPAL", amount: principalMinor, cash: principal.cashDeltaMinor, principal: principal.principalDeltaMinor, impact: "NINGUNO" } : null,
      interestMinor ? { index: 1, type: "INTERES", component: "INTERES", amount: interestMinor, cash: interest.cashDeltaMinor, principal: 0, impact: interest.impact } : null,
      feeMinor ? { index: 2, type: "COMISION", component: "COMISION", amount: feeMinor, cash: fee.cashDeltaMinor, principal: 0, impact: fee.impact } : null,
    ].filter(Boolean);
    const balance = Number(account.saldoActualMinor ?? account.saldoInicialMinor ?? 0) + cashDelta;
    const pointerEvent = events.at(-1);
    for (const [position, item] of events.entries()) {
      appendAccountingEvent(transaction, eventRefs[item.index], fs, cashMovementEvent({
        operationCollection: "deudas", operationId, operationType: item.type, accountId: values.cuenta_id,
        currency, effectiveDate: values.fecha, cashDeltaMinor: item.cash, principalDeltaMinor: item.principal,
        impact: item.impact, resultDeltaMinor: item.impact === "INGRESO" ? item.amount : item.impact === "GASTO" ? -item.amount : 0,
        component: item.component, snapshot: { deudaId: debtId, principalMinor, interestMinor, feeMinor, cambioEfectivoTotalMinor: cashDelta, descripcion: values.descripcion || "" },
      }));
    }
    transaction.update(accountRef, { saldoActualMinor: balance, ...accountingPointer(eventRefs[pointerEvent.index].id, operationId), updatedAt: fs.serverTimestamp() });
    transaction.update(debtRef, { montoPagadoMinor: newPaid, estado: newPaid >= total ? "PAGADA" : "PENDIENTE", ...accountingPointer(eventRefs[pointerEvent.index].id, operationId), updatedAt: fs.serverTimestamp() });
  });
  return operationId;
}

export async function removeDocument(uid, name, id) {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  const targetRef = fs.doc(await collectionRef(uid, name), id);
  const references = {
    cuentas: [["movimientos", "cuenta_id"], ["transferencias", "cuenta_origen_id"], ["transferencias", "cuenta_destino_id"], ["pagosTarjeta", "cuenta_id"], ["tarjetas", "cuenta_id"]],
    tarjetas: [["movimientos", "tarjeta_id"], ["pagosTarjeta", "tarjeta_id"], ["recurrentes", "tarjeta_id"]],
    propietarios: [["cuentas", "propietario_id"]],
    instituciones: [["cuentas", "institucion_id"]],
    categorias: [["movimientos", "categoria_id"], ["presupuestos", "categoria_id"], ["recurrentes", "categoria_id"]],
    deudas: [["eventosContables", "deudaId"], ["movimientos", "deuda_id"]],
  }[name] || [];
  await fs.runTransaction(db, async (transaction) => {
    const targetSnapshot = await transaction.get(targetRef);
    if (!targetSnapshot.exists()) throw new Error("El registro ya no existe. Actualiza la pantalla.");
    const queries = await Promise.all(references.map(async ([collection, field]) => {
    const ref = await collectionRef(uid, collection);
      return fs.query(ref, fs.where(field, "==", id), fs.limit(1));
    }));
    const matches = await Promise.all(queries.map((query) => transaction.get(query)));
    if (matches.some((result) => !result.empty)) throw new Error("No se puede eliminar: otros registros dependen de este elemento. Actualiza o elimina primero esos vínculos.");
    if (name === "cuentas") transaction.update(targetRef, { estado: "ARCHIVADA", updatedAt: fs.serverTimestamp() });
    else if (name === "deudas") {
      const data = targetSnapshot.data();
      if (Number(data.montoTotalMinor || 0) > Number(data.montoPagadoMinor || 0)) throw new Error("No se puede archivar una deuda con saldo pendiente.");
      transaction.update(targetRef, { archivada: true, updatedAt: fs.serverTimestamp() });
    } else if (name === "tarjetas") {
      const data = targetSnapshot.data();
      if (Number(data.utilizadoMinor ?? data.saldoInicialUsadoMinor ?? 0) > 0) throw new Error("No se puede archivar una tarjeta con saldo utilizado.");
      transaction.update(targetRef, { archivada: true, updatedAt: fs.serverTimestamp() });
    } else transaction.delete(targetRef);
  });
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
  const eventRef = await collectionRef(uid, "eventosContables");
  const feeQuery = fs.query(eventRef,
    fs.where("eventoTipo", "in", ["INTERES", "COMISION"]),
    fs.where("moneda", "==", currency),
    fs.where("fechaEfectiva", ">=", startDate),
    fs.where("fechaEfectiva", "<=", endDate));
  const feeTotals = await fs.getAggregateFromServer(feeQuery, {
    income: fs.sum("deltaIngresoMinor"), expense: fs.sum("deltaGastoMinor"),
  });
  const fees = feeTotals.data();
  return {
    incomeMinor: Number(totals[0].total || 0) + Number(fees.income || 0),
    expenseMinor: Number(totals[1].total || 0) + Number(fees.expense || 0),
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

export async function saveLedgerEntry(uid, collectionName, value, id = value.id || null) {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  const ref = await collectionRef(uid, collectionName);
  const docRef = id ? fs.doc(ref, id) : fs.doc(ref);
  const data = encode(uid, collectionName, value);
  const eventRefs = Array.from({ length: 4 }, () => newAccountingEventRef(db, fs, uid));

  if (collectionName === "transferencias") {
    if (!value.cuenta_origen_id || !value.cuenta_destino_id || value.cuenta_origen_id === value.cuenta_destino_id) {
      throw new Error("Selecciona dos cuentas distintas para la transferencia.");
    }
    const amount = toMinorUnits(value.monto, value.moneda || "PEN");
    if (amount <= 0) throw new Error("El importe debe ser mayor que cero.");
    await fs.runTransaction(db, async (transaction) => {
      const operationSnapshot = await transaction.get(docRef);
      if (operationSnapshot.data()?.anulada) throw new Error("La operación está anulada y no se puede modificar.");
      const oldRow = operationSnapshot.exists() ? decode(collectionName, operationSnapshot.id, operationSnapshot.data()) : null;
      const previousRaw = operationSnapshot.data() || {};
      const legacyAnchor = previousRaw.legacyEventAnchorSnapshot || (!previousRaw.eventoContableId && oldRow ? oldRow : null);
      const old = oldRow ? { from: oldRow.cuenta_origen_id, to: oldRow.cuenta_destino_id, amount: Number(operationSnapshot.data().montoMinor || 0) } : null;
      const ids = [...new Set([value.cuenta_origen_id, value.cuenta_destino_id, old?.from, old?.to].filter(Boolean))];
      const accountRefs = ids.map((accountId) => fs.doc(db, ...collectionPath(uid, "cuentas"), accountId));
      const snapshots = await Promise.all(accountRefs.map((accountRef) => transaction.get(accountRef)));
      requireSnapshots(snapshots, "cuenta");
      if (snapshots.some((snapshot) => snapshot.data().moneda !== value.moneda)) throw new Error("Las cuentas y la transferencia deben usar la misma moneda.");
      const balanceChanges = new Map(ids.map((accountId, index) => [accountId, Number(snapshots[index].data()?.saldoActualMinor ?? snapshots[index].data()?.saldoInicialMinor ?? 0)]));
      if (old) { balanceChanges.set(old.from, balanceChanges.get(old.from) + old.amount); balanceChanges.set(old.to, balanceChanges.get(old.to) - old.amount); }
      balanceChanges.set(value.cuenta_origen_id, balanceChanges.get(value.cuenta_origen_id) - amount);
      balanceChanges.set(value.cuenta_destino_id, balanceChanges.get(value.cuenta_destino_id) + amount);
      const effectiveDate = oldRow?.fecha || value.fecha;
      let eventIndex = 0;
      if (old) {
        appendAccountingEvent(transaction, eventRefs[eventIndex++], fs, cashMovementEvent({ operationCollection: collectionName, operationId: docRef.id, operationType: "REVERSIÓN", accountId: old.from, currency: value.moneda, effectiveDate, cashDeltaMinor: old.amount, impact: "NINGUNO", relatedEventId: operationSnapshot.data()?.eventoContableId || null, reason: "Corrección vinculada a la operación original", snapshot: oldRow }));
        appendAccountingEvent(transaction, eventRefs[eventIndex++], fs, cashMovementEvent({ operationCollection: collectionName, operationId: docRef.id, operationType: "REVERSIÓN", accountId: old.to, currency: value.moneda, effectiveDate, cashDeltaMinor: -old.amount, impact: "NINGUNO", relatedEventId: operationSnapshot.data()?.eventoContableId || null, reason: "Corrección vinculada a la operación original", snapshot: oldRow }));
      }
      const sourceEventRef = eventRefs[eventIndex++];
      const destinationEventRef = eventRefs[eventIndex++];
      appendAccountingEvent(transaction, sourceEventRef, fs, cashMovementEvent({ operationCollection: collectionName, operationId: docRef.id, operationType: "TRANSFERENCIA", accountId: value.cuenta_origen_id, currency: value.moneda, effectiveDate, cashDeltaMinor: -amount, impact: "NINGUNO", relatedEventId: operationSnapshot.data()?.eventoContableId || null, snapshot: { ...data, montoMinor: amount, legacyEventAnchor: Boolean(legacyAnchor) } }));
      appendAccountingEvent(transaction, destinationEventRef, fs, cashMovementEvent({ operationCollection: collectionName, operationId: docRef.id, operationType: "TRANSFERENCIA", accountId: value.cuenta_destino_id, currency: value.moneda, effectiveDate, cashDeltaMinor: amount, impact: "NINGUNO", relatedEventId: operationSnapshot.data()?.eventoContableId || null, snapshot: { ...data, montoMinor: amount, legacyEventAnchor: Boolean(legacyAnchor) } }));
      transaction.set(docRef, { ...data, ...(legacyAnchor ? { legacyEventAnchor: true, legacyEventAnchorSnapshot: legacyAnchor } : {}), fecha: effectiveDate, montoMinor: amount, eventoContableId: eventRefs[eventIndex - 1].id, createdAt: previousRaw.createdAt || fs.serverTimestamp() });
      for (const accountId of ids) {
        const eventRef = accountId === value.cuenta_origen_id ? sourceEventRef : accountId === value.cuenta_destino_id ? destinationEventRef : eventRefs[old?.from === accountId ? 0 : 1];
        transaction.update(accountRefs[ids.indexOf(accountId)], { saldoActualMinor: balanceChanges.get(accountId), ...accountingPointer(eventRef.id, docRef.id), updatedAt: fs.serverTimestamp() });
      }
    });
  } else if (collectionName === "pagosTarjeta") {
    const amount = toMinorUnits(value.monto, value.moneda || "PEN");
    if (!value.cuenta_id || !value.tarjeta_id) throw new Error("Selecciona la cuenta de pago y la tarjeta.");
    await fs.runTransaction(db, async (transaction) => {
      const operationSnapshot = await transaction.get(docRef);
      if (operationSnapshot.data()?.anulada) throw new Error("La operación está anulada y no se puede modificar.");
      const oldRow = operationSnapshot.exists() ? decode(collectionName, operationSnapshot.id, operationSnapshot.data()) : null;
      const previousRaw = operationSnapshot.data() || {};
      const legacyAnchor = previousRaw.legacyEventAnchorSnapshot || (!previousRaw.eventoContableId && oldRow ? oldRow : null);
      const old = oldRow ? { card: oldRow.tarjeta_id, account: oldRow.cuenta_id, amount: Number(operationSnapshot.data().montoMinor || 0) } : null;
      const accountIds = [...new Set([value.cuenta_id, old?.account].filter(Boolean))];
      const cardIds = [...new Set([value.tarjeta_id, old?.card].filter(Boolean))];
      const accountRefs = accountIds.map((accountId) => fs.doc(db, ...collectionPath(uid, "cuentas"), accountId));
      const cardRefs = cardIds.map((cardId) => fs.doc(db, ...collectionPath(uid, "tarjetas"), cardId));
      const snapshots = await Promise.all([...accountRefs, ...cardRefs].map((documentRef) => transaction.get(documentRef)));
      requireSnapshots(snapshots, "cuenta o tarjeta");
      if ([...snapshots].some((snapshot) => snapshot.data().moneda !== value.moneda)) throw new Error("La tarjeta, la cuenta y el pago deben usar la misma moneda.");
      const accountChanges = new Map(accountIds.map((accountId, index) => [accountId, Number(snapshots[index].data()?.saldoActualMinor ?? snapshots[index].data()?.saldoInicialMinor ?? 0)]));
      const cardChanges = new Map(cardIds.map((cardId, index) => [cardId, Number(snapshots[accountRefs.length + index].data()?.utilizadoMinor ?? snapshots[accountRefs.length + index].data()?.saldoInicialUsadoMinor ?? 0)]));
      if (old) { accountChanges.set(old.account, accountChanges.get(old.account) + old.amount); cardChanges.set(old.card, cardChanges.get(old.card) + old.amount); }
      if (snapshots[accountRefs.length + cardIds.indexOf(value.tarjeta_id)].data().tipo !== "CREDITO") throw new Error("Solo se pueden registrar pagos para tarjetas de crédito.");
      validatePaymentAmount(amount, cardChanges.get(value.tarjeta_id));
      accountChanges.set(value.cuenta_id, accountChanges.get(value.cuenta_id) - amount);
      cardChanges.set(value.tarjeta_id, cardChanges.get(value.tarjeta_id) - amount);
      const effectiveDate = oldRow?.fecha || value.fecha;
      if (old) appendAccountingEvent(transaction, eventRefs[0], fs, cashMovementEvent({ operationCollection: collectionName, operationId: docRef.id, operationType: "REVERSIÓN", accountId: old.account, currency: value.moneda, effectiveDate, cashDeltaMinor: old.amount, principalDeltaMinor: old.amount, impact: "NINGUNO", relatedEventId: operationSnapshot.data()?.eventoContableId || null, reason: "Corrección vinculada a la operación original", snapshot: oldRow }));
      const paymentEventRef = eventRefs[old ? 1 : 0];
      appendAccountingEvent(transaction, paymentEventRef, fs, cashMovementEvent({ operationCollection: collectionName, operationId: docRef.id, operationType: "PAGO_TARJETA", accountId: value.cuenta_id, currency: value.moneda, effectiveDate, cashDeltaMinor: -amount, principalDeltaMinor: -amount, impact: "NINGUNO", relatedEventId: operationSnapshot.data()?.eventoContableId || null, snapshot: { ...data, montoMinor: amount, tarjeta_id: value.tarjeta_id, legacyEventAnchor: Boolean(legacyAnchor) } }));
      transaction.set(docRef, { ...data, ...(legacyAnchor ? { legacyEventAnchor: true, legacyEventAnchorSnapshot: legacyAnchor } : {}), fecha: effectiveDate, montoMinor: amount, eventoContableId: eventRefs[old ? 1 : 0].id, createdAt: previousRaw.createdAt || fs.serverTimestamp() });
      accountIds.forEach((accountId, index) => transaction.update(accountRefs[index], { saldoActualMinor: accountChanges.get(accountId), ...accountingPointer(accountId === value.cuenta_id ? paymentEventRef.id : eventRefs[0].id, docRef.id), updatedAt: fs.serverTimestamp() }));
      cardIds.forEach((cardId, index) => transaction.update(cardRefs[index], { utilizadoMinor: cardChanges.get(cardId), ...accountingPointer(cardId === value.tarjeta_id ? paymentEventRef.id : eventRefs[0].id, docRef.id), updatedAt: fs.serverTimestamp() }));
    });
  } else {
    throw new Error("Tipo de operación contable no compatible.");
  }
  return docRef.id;
}

export async function saveMovement(uid, value, id = value.id || null) {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  const ref = await collectionRef(uid, "movimientos");
  const docRef = id ? fs.doc(ref, id) : fs.doc(ref);
  const eventRefs = [newAccountingEventRef(db, fs, uid), newAccountingEventRef(db, fs, uid)];
  const data = encode(uid, "movimientos", value);
  const amount = toMinorUnits(value.monto, value.moneda || "PEN");
  if (amount <= 0 || !["INGRESO", "GASTO"].includes(value.tipo)) throw new Error("El movimiento requiere un importe positivo y un tipo válido.");
  await fs.runTransaction(db, async (transaction) => {
    const operationSnapshot = await transaction.get(docRef);
    if (operationSnapshot.data()?.anulada) throw new Error("La operación está anulada y no se puede modificar.");
    const oldRow = operationSnapshot.exists() ? decode("movimientos", operationSnapshot.id, operationSnapshot.data()) : null;
    const previousRaw = operationSnapshot.data() || {};
    const legacyAnchor = previousRaw.legacyEventAnchorSnapshot || (!previousRaw.eventoContableId && oldRow ? oldRow : null);
    const cardIds = [...new Set([oldRow?.tarjeta_id, value.tarjeta_id].filter(Boolean))];
    const cardRefs = cardIds.map((cardId) => fs.doc(db, ...collectionPath(uid, "tarjetas"), cardId));
    const cardSnapshots = await Promise.all(cardRefs.map((cardRef) => transaction.get(cardRef)));
    requireSnapshots(cardSnapshots, "tarjeta");
    const cardById = new Map(cardIds.map((cardId, index) => [cardId, cardSnapshots[index].data()]));
    const currentAccountId = resolveMovementAccountId({ accountId: value.cuenta_id, paymentMethod: value.medio_pago, cardAccountId: cardById.get(value.tarjeta_id)?.cuenta_id });
    const oldAccountId = oldRow ? resolveMovementAccountId({ accountId: oldRow.cuenta_id, paymentMethod: oldRow.medio_pago, cardAccountId: cardById.get(oldRow.tarjeta_id)?.cuenta_id }) : null;
    const current = {
      accountId: currentAccountId,
      cardId: value.tarjeta_id || null,
      delta: movementDelta({ amountMinor: amount, type: value.tipo, paymentMethod: value.medio_pago, accountId: currentAccountId }),
      cardDelta: creditCardDebtDelta({ amountMinor: amount, type: value.tipo, paymentMethod: value.medio_pago }),
    };
    const old = oldRow ? {
      accountId: oldAccountId,
      cardId: oldRow.tarjeta_id || null,
      delta: movementDelta({ amountMinor: Number(operationSnapshot.data().montoMinor || 0), type: oldRow.tipo, paymentMethod: oldRow.medio_pago, accountId: oldAccountId }),
      cardDelta: creditCardDebtDelta({ amountMinor: Number(operationSnapshot.data().montoMinor || 0), type: oldRow.tipo, paymentMethod: oldRow.medio_pago }),
    } : null;
    const accountIds = [...new Set([old?.accountId, current.accountId].filter(Boolean))];
    const accountRefs = accountIds.map((accountId) => fs.doc(db, ...collectionPath(uid, "cuentas"), accountId));
    const accountSnapshots = await Promise.all(accountRefs.map((accountRef) => transaction.get(accountRef)));
    requireSnapshots(accountSnapshots, "cuenta");
    accountIds.forEach((accountId, index) => {
      if (accountId === current.accountId && accountSnapshots[index].data().moneda !== value.moneda) throw new Error("La cuenta y el movimiento deben usar la misma moneda.");
    });
    cardIds.forEach((cardId, index) => {
      if (cardId === current.cardId && cardSnapshots[index].data().moneda !== value.moneda) throw new Error("La tarjeta y el movimiento deben usar la misma moneda.");
      if (cardId === current.cardId) {
        const card = cardById.get(cardId);
        if (value.medio_pago === "TARJETA_CREDITO" && card.tipo !== "CREDITO") throw new Error("La tarjeta seleccionada no es de crédito.");
        if (value.medio_pago === "TARJETA_DEBITO" && (card.tipo !== "DEBITO" || card.cuenta_id !== current.accountId)) throw new Error("La cuenta debe coincidir con la cuenta vinculada a la tarjeta de débito.");
        if (!["TARJETA_CREDITO", "TARJETA_DEBITO"].includes(value.medio_pago) || value.tipo !== "GASTO") throw new Error("La tarjeta debe corresponder a un gasto con tarjeta.");
      }
    });
    const accountById = new Map(accountIds.map((accountId, index) => [accountId, accountSnapshots[index].data()]));
    if (current.accountId && !accountById.get(current.accountId)) throw new Error("La cuenta vinculada no existe.");
    const accountChanges = new Map(accountIds.map((accountId) => [accountId, Number(accountById.get(accountId)?.saldoActualMinor ?? accountById.get(accountId)?.saldoInicialMinor ?? 0)]));
    const cardChanges = new Map(cardIds.map((cardId) => [cardId, Number(cardById.get(cardId)?.utilizadoMinor ?? cardById.get(cardId)?.saldoInicialUsadoMinor ?? 0)]));
    if (old?.accountId) accountChanges.set(old.accountId, accountChanges.get(old.accountId) - old.delta);
    if (old?.cardId && old.cardDelta) cardChanges.set(old.cardId, cardChanges.get(old.cardId) - old.cardDelta);
    if (current.accountId) accountChanges.set(current.accountId, accountChanges.get(current.accountId) + current.delta);
    if (current.cardId && current.cardDelta) cardChanges.set(current.cardId, cardChanges.get(current.cardId) + current.cardDelta);
    const effectiveDate = oldRow?.fecha || value.fecha;
    let eventIndex = 0;
    if (old) appendAccountingEvent(transaction, eventRefs[eventIndex++], fs, cashMovementEvent({
      operationCollection: "movimientos", operationId: docRef.id, operationType: "REVERSIÓN", accountId: old.accountId,
      currency: oldRow.moneda, effectiveDate, cashDeltaMinor: -old.delta, principalDeltaMinor: -old.cardDelta,
      impact: "NINGUNO", resultBasisImpact: oldRow.impacto_resultado || oldRow.tipo, resultDeltaMinor: (oldRow.impacto_resultado || oldRow.tipo) === "INGRESO" ? -Number(operationSnapshot.data().montoMinor || 0) : (oldRow.impacto_resultado || oldRow.tipo) === "GASTO" ? Number(operationSnapshot.data().montoMinor || 0) : 0,
      relatedEventId: operationSnapshot.data()?.eventoContableId || null,
      reason: "Corrección vinculada a la operación original", snapshot: { ...oldRow, cuenta_id: old.accountId },
    }));
    const movementEventRef = eventRefs[eventIndex];
    appendAccountingEvent(transaction, movementEventRef, fs, cashMovementEvent({
      operationCollection: "movimientos", operationId: docRef.id, operationType: "MOVIMIENTO", accountId: current.accountId,
      currency: value.moneda, effectiveDate, cashDeltaMinor: current.delta, principalDeltaMinor: current.cardDelta,
      impact: value.impacto_resultado || value.tipo, relatedEventId: operationSnapshot.data()?.eventoContableId || null,
      snapshot: { ...data, cuenta_id: current.accountId, montoMinor: amount, fecha: effectiveDate, legacyEventAnchor: Boolean(legacyAnchor) },
    }));
    transaction.set(docRef, { ...data, cuenta_id: current.accountId, ...(legacyAnchor ? { legacyEventAnchor: true, legacyEventAnchorSnapshot: legacyAnchor } : {}), fecha: effectiveDate, montoMinor: amount, eventoContableId: eventRefs[eventIndex].id, createdAt: previousRaw.createdAt || fs.serverTimestamp() });
    accountIds.forEach((accountId, index) => transaction.update(accountRefs[index], { saldoActualMinor: accountChanges.get(accountId), ...accountingPointer(accountId === current.accountId ? movementEventRef.id : eventRefs[0].id, docRef.id), updatedAt: fs.serverTimestamp() }));
    cardIds.forEach((cardId, index) => transaction.update(cardRefs[index], { utilizadoMinor: Math.max(0, cardChanges.get(cardId)), ...accountingPointer(cardId === current.cardId ? movementEventRef.id : eventRefs[0].id, docRef.id), updatedAt: fs.serverTimestamp() }));
  });
  return docRef.id;
}

export async function deleteLedgerEntry(uid, collectionName, id) {
  const { db, firestoreSdk: fs } = await getFirebaseServices();
  const docRef = fs.doc(db, ...collectionPath(uid, collectionName), id);
  const eventRefs = [newAccountingEventRef(db, fs, uid), newAccountingEventRef(db, fs, uid)];
  await fs.runTransaction(db, async (transaction) => {
    const operationSnapshot = await transaction.get(docRef);
    if (!operationSnapshot.exists()) throw new Error("La operación ya no existe. Actualiza la pantalla.");
    if (operationSnapshot.data().anulada) throw new Error("La operación ya está anulada.");
    const previous = decode(collectionName, operationSnapshot.id, operationSnapshot.data());
    const amount = Number(operationSnapshot.data().montoMinor || 0);
    const cardIds = ["pagosTarjeta", "movimientos"].includes(collectionName) && previous.tarjeta_id ? [previous.tarjeta_id] : [];
    const cardRefs = [...new Set(cardIds.filter(Boolean))].map((cardId) => fs.doc(db, ...collectionPath(uid, "tarjetas"), cardId));
    const cardDocs = await Promise.all(cardRefs.map((item) => transaction.get(item)));
    requireSnapshots(cardDocs, "tarjeta");
    const cardById = new Map(cardIds.map((cardId, index) => [cardId, cardDocs[index].data()]));
    const movementAccountId = resolveMovementAccountId({ accountId: previous.cuenta_id, paymentMethod: previous.medio_pago, cardAccountId: cardById.get(previous.tarjeta_id)?.cuenta_id });
    const accountIds = collectionName === "transferencias"
      ? [previous.cuenta_origen_id, previous.cuenta_destino_id]
      : [movementAccountId].filter(Boolean);
    const accountRefs = [...new Set(accountIds.filter(Boolean))].map((accountId) => fs.doc(db, ...collectionPath(uid, "cuentas"), accountId));
    const accountDocs = await Promise.all(accountRefs.map((item) => transaction.get(item)));
    requireSnapshots(accountDocs, "cuenta");
    const accountBalance = (index) => Number(accountDocs[index].data()?.saldoActualMinor ?? accountDocs[index].data()?.saldoInicialMinor ?? 0);
    const cardBalance = (index) => Number(cardDocs[index].data()?.utilizadoMinor ?? cardDocs[index].data()?.saldoInicialUsadoMinor ?? 0);
    if (collectionName === "transferencias") {
      transaction.update(accountRefs[0], { saldoActualMinor: accountBalance(0) + amount, ...accountingPointer(eventRefs[0].id, id), updatedAt: fs.serverTimestamp() });
      transaction.update(accountRefs[1], { saldoActualMinor: accountBalance(1) - amount, ...accountingPointer(eventRefs[1].id, id), updatedAt: fs.serverTimestamp() });
    } else if (collectionName === "pagosTarjeta") {
      transaction.update(accountRefs[0], { saldoActualMinor: accountBalance(0) + amount, ...accountingPointer(eventRefs[0].id, id), updatedAt: fs.serverTimestamp() });
      transaction.update(cardRefs[0], { utilizadoMinor: cardBalance(0) + amount, ...accountingPointer(eventRefs[0].id, id), updatedAt: fs.serverTimestamp() });
    } else if (collectionName === "movimientos") {
      if (accountRefs.length) transaction.update(accountRefs[0], { saldoActualMinor: accountBalance(0) - (previous.tipo === "INGRESO" ? amount : -amount), ...accountingPointer(eventRefs[0].id, id), updatedAt: fs.serverTimestamp() });
      if (cardRefs.length && previous.medio_pago === "TARJETA_CREDITO") transaction.update(cardRefs[0], { utilizadoMinor: Math.max(0, cardBalance(0) - amount), ...accountingPointer(eventRefs[0].id, id), updatedAt: fs.serverTimestamp() });
    } else throw new Error("Tipo de operación no compatible.");
    const effectiveDate = previous.fecha;
    const sourceEventId = operationSnapshot.data().eventoContableId || null;
    if (collectionName === "transferencias") {
      appendAccountingEvent(transaction, eventRefs[0], fs, cashMovementEvent({ operationCollection: collectionName, operationId: id, operationType: "REVERSIÓN", accountId: previous.cuenta_origen_id, currency: previous.moneda, effectiveDate, cashDeltaMinor: amount, relatedEventId: sourceEventId, impact: "NINGUNO", reason: "Anulación vinculada a la operación original", snapshot: previous }));
      appendAccountingEvent(transaction, eventRefs[1], fs, cashMovementEvent({ operationCollection: collectionName, operationId: id, operationType: "REVERSIÓN", accountId: previous.cuenta_destino_id, currency: previous.moneda, effectiveDate, cashDeltaMinor: -amount, relatedEventId: sourceEventId, impact: "NINGUNO", reason: "Anulación vinculada a la operación original", snapshot: previous }));
    } else {
      const cashDelta = collectionName === "pagosTarjeta" ? -amount : movementDelta({ amountMinor: amount, type: previous.tipo, paymentMethod: previous.medio_pago, accountId: movementAccountId });
      const resultImpact = previous.impacto_resultado || previous.tipo;
      appendAccountingEvent(transaction, eventRefs[0], fs, cashMovementEvent({ operationCollection: collectionName, operationId: id, operationType: "REVERSIÓN", accountId: movementAccountId, currency: previous.moneda, effectiveDate, cashDeltaMinor: -cashDelta, principalDeltaMinor: collectionName === "pagosTarjeta" ? amount : -creditCardDebtDelta({ amountMinor: amount, type: previous.tipo, paymentMethod: previous.medio_pago }), resultBasisImpact: collectionName === "movimientos" ? resultImpact : "NINGUNO", resultDeltaMinor: collectionName === "movimientos" ? (resultImpact === "INGRESO" ? -amount : resultImpact === "GASTO" ? amount : 0) : 0, relatedEventId: sourceEventId, impact: "NINGUNO", reason: "Anulación vinculada a la operación original", snapshot: { ...previous, cuenta_id: movementAccountId } }));
    }
    transaction.update(docRef, { anulada: true, anuladaEn: fs.serverTimestamp(), eventoAnulacionId: eventRefs[0].id, updatedAt: fs.serverTimestamp() });
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
