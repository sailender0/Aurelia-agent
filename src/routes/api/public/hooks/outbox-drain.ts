/**
 * Outbox publisher — drains `outbox_events` with at-least-once semantics.
 *
 * Real notification adapter:
 *   - attendance.check_in / check_out / auto_close → Teams Adaptive Card-ish HTML
 *   - timesheet_approved / timesheet_rejected     → Teams notification
 *   - ATTENDANCE_TRANSACTION_COMMITTED            → legacy variant of attendance.*
 *
 * Each dispatch also writes an audit_log row so we have a paper trail of
 * what was sent out (and on failure: what blew up and why).
 *
 * Triggered by pg_cron every minute, or manually via POST.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { postToTeams } from "@/lib/teams.functions";
import { writeAudit } from "@/modules/audit";

const MAX_BATCH = 50;
const MAX_ATTEMPTS = 5;

type OutboxRow = {
  id: string;
  event_type: string;
  payload: Record<string, any>;
  attempts: number;
};

function escape(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function lookupDisplayName(userId?: string): Promise<string> {
  if (!userId) return "Someone";
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("display_name, email")
    .eq("id", userId)
    .maybeSingle();
  return data?.display_name ?? data?.email ?? "Someone";
}

async function renderCard(row: OutboxRow): Promise<string | null> {
  const p = row.payload ?? {};
  const who = await lookupDisplayName(p.user_id as string | undefined);

  switch (row.event_type) {
    case "attendance.check_in":
    case "ATTENDANCE_TRANSACTION_COMMITTED": {
      if (row.event_type === "ATTENDANCE_TRANSACTION_COMMITTED" && p.action_type !== "check_in") break;
      const when = p.occurred_at ?? new Date().toISOString();
      return `<b>${escape(who)}</b> checked in <i>(${escape(when)})</i>`;
    }
    case "attendance.check_out": {
      const when = p.occurred_at ?? new Date().toISOString();
      return `<b>${escape(who)}</b> checked out <i>(${escape(when)})</i>`;
    }
    case "attendance.auto_close": {
      return `⚠️ <b>${escape(who)}</b> missed checkout — auto-closed at <i>${escape(p.estimated_check_out)}</i>`;
    }
    case "timesheet_approved": {
      return `✅ Timesheet for <b>${escape(who)}</b> (week ${escape(p.week_start)}) was <b>approved</b>${
        p.comment ? ` — “${escape(p.comment)}”` : ""
      }`;
    }
    case "timesheet_rejected": {
      return `❌ Timesheet for <b>${escape(who)}</b> (week ${escape(p.week_start)}) was <b>rejected</b>${
        p.comment ? ` — “${escape(p.comment)}”` : ""
      }`;
    }
  }
  return null;
}

async function dispatch(row: OutboxRow): Promise<{ delivered: boolean; via: string }> {
  const card = await renderCard(row);
  if (!card) {
    console.log(`[outbox] no adapter for ${row.event_type} id=${row.id}`);
    return { delivered: false, via: "no_adapter" };
  }
  const r = await postToTeams(card);
  if ("skipped" in r && r.skipped) return { delivered: false, via: "teams_not_configured" };
  return { delivered: true, via: "teams" };
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

        const results: Array<{ id: string; ok: boolean; via?: string; error?: string }> = [];
        for (const row of rows) {
          try {
            const r = await dispatch(row);
            await supabaseAdmin
              .from("outbox_events")
              .update({ status: "done", processed_at: new Date().toISOString() })
              .eq("id", row.id);
            await writeAudit({
              actorKind: "system",
              action: "outbox.dispatched",
              targetTable: "outbox_events",
              targetId: row.id,
              after: { event_type: row.event_type, via: r.via, delivered: r.delivered },
            });
            results.push({ id: row.id, ok: true, via: r.via });
          } catch (e: any) {
            const nextAttempts = row.attempts + 1;
            const giveUp = nextAttempts >= MAX_ATTEMPTS;
            const msg = String(e?.message ?? e);
            await supabaseAdmin
              .from("outbox_events")
              .update({
                status: giveUp ? "failed" : "pending",
                attempts: nextAttempts,
                last_error: msg.slice(0, 1000),
              })
              .eq("id", row.id);
            await writeAudit({
              actorKind: "system",
              action: "outbox.failed",
              targetTable: "outbox_events",
              targetId: row.id,
              after: { event_type: row.event_type, error: msg, attempts: nextAttempts, gave_up: giveUp },
            });
            results.push({ id: row.id, ok: false, error: msg });
          }
        }

        return Response.json({ claimed: rows.length, results });
      },
    },
  },
});
