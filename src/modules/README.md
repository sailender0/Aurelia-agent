# Modular Monolith — internal boundaries

This `src/modules/` tree contains the attendance domain split into isolated
units. Each module exposes a narrow surface via its `index.ts`; nothing else is
considered public.

## Layout

- `timezone/` — pure IANA helpers (work date, ISO weekday, wall-clock math).
  No I/O, no React, no Supabase. Safe to import anywhere.
- `calendar/` — work-day classification (weekend / holiday / working) and
  work-window checks. Pure functions over data passed in.
- `attendance/` — orchestrator. Server-only (imports `client.server`). Loads
  user context (timezone, work hours, holidays), enforces business rules,
  then calls the SQL function `record_attendance_action` which performs the
  atomic transaction (idempotency_keys + attendance_sessions +
  attendance_events + outbox_events).

## Boundary rules

1. `timezone` may not import from `calendar` or `attendance`.
2. `calendar` may only import from `timezone`.
3. `attendance` may import from `timezone`, `calendar`, and
   `@/integrations/supabase/client.server`. It must not be imported from
   browser code — server functions / server routes only.
4. UI and route files MUST NOT touch attendance tables directly. They call a
   `createServerFn` that wraps `recordAttendance`.

## Transactional outbox

`outbox_events` is the integration boundary. Inserts happen inside the same
DB transaction as the session/event write, so an external worker (separate
deliverable, not wired up yet) can drain it with at-least-once semantics
without risking double check-ins. The worker should:

  - claim a row by `UPDATE ... SET status='processing' WHERE id=$1 AND status='pending' RETURNING *`
  - dispatch the side effect (Teams card, email, webhook)
  - mark `status='done'` on success or `status='failed'` + `last_error` on permanent failure

## Idempotency

Callers MUST supply a stable `idempotencyKey` (>= 8 chars). The RPC inserts
it into `idempotency_keys`; a unique-violation short-circuits to a
`{ ok: true, duplicate: true }` response without touching any other table.
