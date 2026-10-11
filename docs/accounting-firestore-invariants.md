# Firestore accounting invariants

This is the client-side accounting model for the static Firebase application. New balance-changing transactions write their operation, the immutable accounting event(s), and each affected entity's pointers atomically.

## Fields and links

- `cuentas`, `tarjetas`, and `deudas` may contain `ultimoEventoContableId` and `ultimaOperacionContableId`. These are optional on untouched historical documents; no backfill is implied.
- A cash-account event identifies the account through `cuentaId`. A card event identifies the card through `operacionSnapshot.tarjeta_id`. A debt event identifies the debt through `deudaId`.
- `movimientos`, `transferencias`, and `pagosTarjeta` store `eventoContableId`. An annulment stores `eventoAnulacionId`; the event is `REVERSIÓN` and its `eventoRelacionadoId` identifies the original event when one existed.
- Pointer events and operation-linked events must be new in the same atomic write. Rules reject pointers to already-existing events, event IDs outside the authenticated user's `users/{uid}` path, mismatched operation IDs, wrong event kinds, and snapshots whose relevant amount/type/account/card fields do not match the operation.
- Event documents allow create and read by their owner, but never update or delete. Historical documents without pointers remain readable and can be edited in non-financial fields without backfilling them.

## Transaction requirements

The client transaction computes the new balance from the transaction's reads, applies the matching account/card/debt updates, writes every event in the operation group, and writes the pointers before commit. Firestore transactions retry on conflicting concurrent writes. Corrections keep the original effective date, append a reversal and replacement event, and do not overwrite prior events. An annulment appends a reversal and marks the operation as annulled.

## What Security Rules cannot prove

Rules can verify that a newly written event is owner-scoped, linked to the operation/entity, and has matching identity fields. Rules cannot enumerate arbitrary event history to prove that a materialized balance equals the sum of every historical event; they also cannot generally prove that a multi-leg transfer or multi-component debt settlement includes every expected sibling event and that the siblings sum to the balance delta. The client transaction is responsible for those calculations. The emulator suite checks representative complete transactions and concurrent retries, but a privileged Firebase Admin writer bypasses client rules. A later independent reconciliation/administrative process would be needed for cryptographic or server-enforced ledger completeness; that is outside this static-client stage.

## Compatibility boundary

The previous client performs physical ledger deletions and balance changes without linked events. Final rules intentionally reject those writes. Do not publish the final rules against the previous client. Use the approved short maintenance window: temporarily block writes, publish the coordinated client and final rules, then run isolated verification. Do not backfill historical pointers or infer opening balances during this release.
