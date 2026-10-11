# Firestore accounting invariants

This is the client-side accounting model for the static Firebase application. New balance-changing transactions write their operation, the immutable accounting event(s), and each affected entity's pointers atomically.

## Fields and links

- `cuentas`, `tarjetas`, and `deudas` may contain `ultimoEventoContableId` and `ultimaOperacionContableId`. These are optional on untouched historical documents; no backfill is implied.
- A cash-account event identifies the account through `cuentaId`. A card event identifies the card through `operacionSnapshot.tarjeta_id`. A debt event identifies the debt through `deudaId`.
- `movimientos`, `transferencias`, and `pagosTarjeta` store `eventoContableId`. An annulment stores `eventoAnulacionId`; the event is `REVERSIÓN` and its `eventoRelacionadoId` identifies the original event when one existed.
- Pointer events and operation-linked events must be new in the same atomic write. Rules reject pointers to already-existing events, event IDs outside the authenticated user's `users/{uid}` path, mismatched operation IDs, wrong event kinds, and snapshots whose relevant amount/type/account/card fields do not match the operation.
- New account/card balance events carry `operacionSnapshot.saldoCambioAplicadoMinor` and `operacionSnapshot.utilizadoCambioAplicadoMinor`. Rules compare the appropriate value with the exact before/after balance difference in the same atomic write. For simple events the applied delta must also equal the event's `montoDeltaMinor`/`deltaPrincipalMinor`; debt settlements can use `cambioEfectivoTotalMinor`, and linked corrections/reversals use their aggregate net applied delta.
- `moneda` is immutable for an existing account, card, debt, movement, transfer, or card payment. Every new event must use the currency of its referenced account, card, or debt, and ledger operations must agree with their event currency. Existing records are not backfilled or changed.
- Event documents allow create and read by their owner, but never update or delete. Historical documents without pointers remain readable and can be edited in non-financial fields without backfilling them.

## Transaction requirements

The client transaction computes the new balance from the transaction's reads, applies the matching account/card/debt updates, writes every event in the operation group, and writes the pointers before commit. Firestore transactions retry on conflicting concurrent writes. Corrections keep the original effective date, append a reversal and replacement event, and do not overwrite prior events. An annulment appends a reversal and marks the operation as annulled.

## What Security Rules cannot prove

Rules can compare the materialized balance change to the linked event's declared applied delta, and verify that a simple event's applied delta agrees with its event delta. Rules cannot enumerate arbitrary event history to prove that a materialized balance equals the sum of every historical event; for multi-leg corrections, they cannot independently enumerate all sibling reversals/replacements to recompute the aggregate marker. They also cannot prove semantic completeness of multi-component debt settlements beyond the declared `cambioEfectivoTotalMinor` and checked principal change. The client transaction is responsible for assembling those atomic event groups. A privileged Firebase Admin writer bypasses client rules.

## Compatibility boundary

The previous client performs physical ledger deletions and balance changes without linked events. Final rules intentionally reject those writes. Do not publish the final rules against the previous client. Use the approved short maintenance window: temporarily block writes, publish the coordinated client and final rules, then run isolated verification. Do not backfill historical pointers or infer opening balances during this release.
