/**
 * Public attendance ingestion adapter.
 *
 * POST /api/public/attendance/check-in
 * Body: { email: string, type: 'check_in'|'check_out', timestamp?: ISO8601, idempotency_key?: string, source?: string }
 *
 * Responsibilities:
 *   - Validate input (zod).
 *   - Resolve email -> profiles.id.
 *   - Generate a stable idempotency key if the caller didn't provide one.
 *   - Hand off to modules/attendance.recordAttendance (Modular Monolith boundary).
 *
 * NOTE: This endpoint is unauthenticated by design (e.g. badge readers,
 * Teams bot, third-party kiosks). All business rules live inside the
 * attendance module + the SQL transaction; this file is purely an adapter.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordAttendance } from "@/modules/attendance";

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  type: z.enum(["check_in", "check_out"]),
  timestamp: z.string().datetime().optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
  source: z.string().min(1).max(32).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/attendance/check-in")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),

      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "invalid_payload", details: parsed.error.flatten() }, 400);
        }
        const { email, type, timestamp, idempotency_key, source } = parsed.data;

        const occurredAt = timestamp ? new Date(timestamp) : new Date();
        if (Number.isNaN(occurredAt.getTime())) {
          return json({ error: "invalid_timestamp" }, 400);
        }

        // Resolve email -> user id (no PII echoed back).
        const { data: profile, error: profErr } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        if (profErr) return json({ error: "lookup_failed" }, 500);
        if (!profile) return json({ error: "user_not_found" }, 404);

        // Stable idempotency key: trust the caller, otherwise derive
        // deterministically from (user, type, minute) so a duplicate badge
        // tap within the same minute is collapsed.
        const minuteBucket = Math.floor(occurredAt.getTime() / 60_000);
        const idempotencyKey =
          idempotency_key ??
          createHash("sha256")
            .update(`${profile.id}|${type}|${minuteBucket}`)
            .digest("hex")
            .slice(0, 32);

        try {
          const result = await recordAttendance({
            userId: profile.id,
            action: type,
            idempotencyKey,
            occurredAt,
            source: source ?? "public_api",
            metadata: { email, ingested_at: new Date().toISOString() },
          });
          return json(
            {
              ok: result.ok,
              duplicate: result.duplicate,
              session_id: result.sessionId,
              status: result.status,
            },
            200,
          );
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          // Map domain errors to HTTP codes
          if (msg.startsWith("not_a_working_day") || msg === "outside_work_window") {
            return json({ error: msg }, 422);
          }
          if (msg === "already_checked_in" || msg === "no_open_session") {
            return json({ error: msg }, 409);
          }
          if (msg === "profile_not_found") return json({ error: msg }, 404);
          console.error("[check-in] unexpected", msg);
          return json({ error: "internal_error" }, 500);
        }
      },
    },
  },
});
