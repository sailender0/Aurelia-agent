/**
 * Outbox publisher — drains `outbox_events` with at-least-once semantics.
 *
 * Flow per row:
 *   1. Atomically claim a batch: UPDATE ... SET status='processing' WHERE status='pending'.
 *   2. "Dispatch" each event (logged here; real adapter wires Teams/email/webhook).
 *   3. On success → status='done', processed_at=now().
 *   4. On failure → status='failed' (or back to 'pending' for retry under cap), bump attempts.
 *
 * Triggered by pg_cron (every minute) or manually for tests.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MAX_BATCH = 50;
const MAX_ATTEMPTS = 5;

type OutboxRow = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
};

async function dispatch(row: OutboxRow): Promise<void> {
  // Stub adapter. Real handlers belong to dedicated modules
  // (Teams card, email, generic webhook). Throw to mark failure.
  console.log(`[outbox] dispatch ${row.event_type} id=${row.id}`, row.payload);
}

export const Route = createFileRoute("/api/public/hooks/outbox-drain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("apikey") ?? request.headers.get("x-cron-secret");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!auth || (auth !== expected && auth !== process.env.ACTIVITY_INGEST_SECRET)) {
          return new Response("Unauthorized", { status: 401 });
        }

        // 1. Claim a batch. Two-step claim (select pending → update to 'processing'
        //    filtered by status='pending') prevents double-dispatch across concurrent
        //    drainers: the second UPDATE filter will skip any row another worker grabbed.
        let rows: OutboxRow[] = [];
        const { data: pending, error: selErr } = await supabaseAdmin
          .from("outbox_events")
          .select("id")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(MAX_BATCH);
        if (selErr) return Response.json({ error: selErr.message }, { status: 500 });

        if (pending && pending.length > 0) {
          const ids = pending.map((r) => r.id);
          const { data: locked, error: upErr } = await supabaseAdmin
            .from("outbox_events")
            .update({ status: "processing" })
            .in("id", ids)
            .eq("status", "pending")
            .select("id, event_type, payload, attempts");
          if (upErr) return Response.json({ error: upErr.message }, { status: 500 });
          rows = ((locked ?? []) as unknown) as OutboxRow[];
        }

        // 2-4. Dispatch each, then update final status.
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const row of rows) {
          try {
            await dispatch(row);
            await supabaseAdmin
              .from("outbox_events")
              .update({ status: "done", processed_at: new Date().toISOString() })
              .eq("id", row.id);
            results.push({ id: row.id, ok: true });
          } catch (e: any) {
            const nextAttempts = row.attempts + 1;
            const giveUp = nextAttempts >= MAX_ATTEMPTS;
            await supabaseAdmin
              .from("outbox_events")
              .update({
                status: giveUp ? "failed" : "pending",
                attempts: nextAttempts,
                last_error: String(e?.message ?? e).slice(0, 1000),
              })
              .eq("id", row.id);
            results.push({ id: row.id, ok: false, error: String(e?.message ?? e) });
          }
        }

        return Response.json({ claimed: rows.length, results });
      },
    },
  },
});
