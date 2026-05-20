/**
 * Power Automate email webhook adapter.
 *
 * POST /api/public/attendance/email-webhook
 *
 * Power Automate forwards the body of any email whose subject equals
 * `ATTENDANCE_WEBHOOK_SUBMIT` to this endpoint. The email body is a simple
 * key/value text block:
 *
 *   email: someone@example.com
 *   type: check_in
 *
 * Accepted payload shapes (Power Automate is flexible):
 *   { "subject": "...", "body": "email: ...\ntype: ..." }
 *   { "subject": "...", "body": "...", "from": "sender@..." }
 *   Raw text/plain body (we treat the entire payload as body, subject
 *   defaults to the magic value).
 *
 * Security: shared secret via `x-webhook-secret` header
 * (env: `ATTENDANCE_INGEST_SECRET`, falls back to `ACTIVITY_INGEST_SECRET`).
 *
 * Side effects:
 *   1. Insert raw row into `attendance` (audit log of every email).
 *   2. Best-effort hand-off to the Modular Monolith `recordAttendance`
 *      orchestrator so the standard session / outbox / Teams pipeline runs.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordAttendance } from "@/modules/attendance";

const MAGIC_SUBJECT = "ATTENDANCE_WEBHOOK_SUBMIT";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseKeyValueBody(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Strip common HTML tags Power Automate may include when forwarding HTML email.
  const stripped = body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  for (const rawLine of stripped.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key && value && !(key in out)) out[key] = value;
  }
  return out;
}

export const Route = createFileRoute("/api/public/attendance/email-webhook")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, x-webhook-secret",
          },
        }),

      POST: async ({ request }) => {
        const expected =
          process.env.ATTENDANCE_INGEST_SECRET ?? process.env.ACTIVITY_INGEST_SECRET;
        const provided =
          request.headers.get("x-webhook-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!expected || !provided || provided !== expected) {
          return json({ error: "unauthorized" }, 401);
        }

        // Accept either JSON {subject, body} or raw text body.
        let subject = "";
        let body = "";
        const contentType = request.headers.get("content-type") ?? "";
        try {
          if (contentType.includes("application/json")) {
            const raw = (await request.json()) as {
              subject?: string;
              body?: string;
              Subject?: string;
              Body?: string;
            };
            subject = (raw.subject ?? raw.Subject ?? "").toString().trim();
            body = (raw.body ?? raw.Body ?? "").toString();
          } else {
            body = await request.text();
            subject = request.headers.get("x-mail-subject") ?? MAGIC_SUBJECT;
          }
        } catch {
          return json({ error: "invalid_payload" }, 400);
        }

        if (!subject) subject = MAGIC_SUBJECT; // tolerate Power Automate omissions
        if (!subject.toUpperCase().includes(MAGIC_SUBJECT)) {
          return json({ error: "subject_mismatch", expected: MAGIC_SUBJECT }, 422);
        }
        if (!body || body.length > 16_000) {
          return json({ error: "invalid_body" }, 400);
        }

        const fields = parseKeyValueBody(body);
        const email = (fields.email ?? "").toLowerCase();
        const type = (fields.type ?? "").toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return json({ error: "missing_or_invalid_email" }, 422);
        }
        if (type !== "check_in" && type !== "check_out") {
          return json({ error: "invalid_type", expected: ["check_in", "check_out"] }, 422);
        }

        const occurredAt = fields.timestamp ? new Date(fields.timestamp) : new Date();
        const occurredAtIso = Number.isNaN(occurredAt.getTime())
          ? new Date().toISOString()
          : occurredAt.toISOString();

        // 1. Append to raw audit log.
        const { error: insertErr } = await supabaseAdmin.from("attendance").insert({
          email,
          type,
          timestamp: occurredAtIso,
          source: "power_automate_email",
          raw_subject: subject.slice(0, 255),
        });
        if (insertErr) {
          console.error("[email-webhook] insert failed", insertErr);
          return json({ error: "log_insert_failed" }, 500);
        }

        // 2. Best-effort: hand off to the attendance domain so sessions,
        //    events and outbox notifications fire like a normal check-in.
        let domain: { ok: boolean; duplicate?: boolean; error?: string } = { ok: false };
        try {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("email", email)
            .maybeSingle();
          if (profile) {
            const minuteBucket = Math.floor(new Date(occurredAtIso).getTime() / 60_000);
            const idempotencyKey = createHash("sha256")
              .update(`email|${profile.id}|${type}|${minuteBucket}`)
              .digest("hex")
              .slice(0, 32);
            const r = await recordAttendance({
              userId: profile.id,
              action: type,
              idempotencyKey,
              occurredAt: new Date(occurredAtIso),
              source: "power_automate_email",
              metadata: { email, subject },
            });
            domain = { ok: r.ok, duplicate: r.duplicate };
          } else {
            domain = { ok: false, error: "profile_not_found" };
          }
        } catch (e: any) {
          domain = { ok: false, error: String(e?.message ?? e) };
        }

        return json({ ok: true, logged: true, domain }, 200);
      },
    },
  },
});
