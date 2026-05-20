/**
 * Resend inbound-email webhook → attendance ingestion.
 *
 * POST /api/public/attendance/email-webhook
 *
 * Resend delivers `email.received` events with this shape:
 *   {
 *     "type": "email.received",
 *     "created_at": "...",
 *     "data": {
 *       "from": "...",
 *       "to": ["..."],
 *       "subject": "...",
 *       "text": "secret: abc...\nemail: alice@acme.com\ntype: check_in\n",
 *       "html": "<p>...</p>",
 *       ...
 *     }
 *   }
 *
 * Auth: prefer the `x-webhook-secret` header. If absent, fall back to the
 * `secret:` line embedded in the email body. Both are compared in constant
 * time against ATTENDANCE_INGEST_SECRET (legacy fallback: ACTIVITY_INGEST_SECRET).
 *
 * Body must contain at minimum `email:` and `type:` lines. The parsed payload
 * is forwarded to the same `recordAttendance` domain module that powers the
 * JSON `check-in` endpoint, so business rules, idempotency, and the outbox
 * stay in one place.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordAttendance } from "@/modules/attendance";

const ResendEnvelope = z.object({
  type: z.string().optional(),
  data: z
    .object({
      text: z.string().optional(),
      html: z.string().optional(),
      subject: z.string().optional(),
      from: z.union([z.string(), z.object({}).passthrough()]).optional(),
    })
    .passthrough(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Robust HTML stripper that ensures clean line breaks between block elements */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<p[^>]*>/gi, "\n") // Turn paragraphs into clear newlines
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

/** Parse "key: value" lines even if they are mashed together inside dirty HTML text strings */
function parseKeyedLines(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Normalize spacing and split by line breaks
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/^[>|\s]+/, "").trim();
    if (!line) continue;
    
    const m = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.+)$/.exec(line);
    if (!m) continue;
    
    const key = m[1].toLowerCase().trim();
    if (!(key in out)) out[key] = m[2].trim();
  }
  return out;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/attendance/email-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedSecret =
          process.env.ATTENDANCE_INGEST_SECRET ??
          process.env.ACTIVITY_INGEST_SECRET;
        if (!expectedSecret) {
          console.error("[email-webhook] no ingest secret configured");
          return json({ error: "server_not_configured" }, 500);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }
        
        const parsed = ResendEnvelope.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "invalid_payload" }, 400);
        }
        const { data } = parsed.data;

        // Extract and clean raw body text profile
        let bodyText = data.text ?? "";
        if (data.html) {
          // Process the HTML to ensure lines don't mash together
          bodyText = htmlToText(data.html) + "\n" + bodyText;
        }

        if (!bodyText.trim()) {
          return json({ error: "empty_email_body" }, 400);
        }

        const fields = parseKeyedLines(bodyText);

        // Security Check
        const headerSecret = request.headers.get("x-webhook-secret") ?? "";
        const bodySecret = fields.secret ?? "";
        const provided = headerSecret || bodySecret;
        if (!provided || !safeEqual(provided, expectedSecret)) {
          return json({ error: "unauthorized" }, 401);
        }

        // Extract input fields safely
        const email = (fields.email ?? "").toLowerCase();
        let rawType = (fields.type ?? "").toLowerCase().replace(/\s+/g, "_");

        // 🔄 NEW TRANSLATION LAYER: Map messy Power Automate strings to Zod Enums
        if (rawType === "clock_in" || rawType === "check_in") rawType = "check_in";
        if (rawType === "clock_out" || rawType === "check_out") rawType = "check_out";

        const FieldsSchema = z.object({
          email: z.string().email().max(255),
          type: z.enum(["check_in", "check_out"]),
        });

        const fieldCheck = FieldsSchema.safeParse({ email, type: rawType });
        if (!fieldCheck.success) {
          return json({ 
            error: "missing_or_invalid_fields", 
            details: fieldCheck.error.flatten(),
            parsedFound: { email, type: rawType } 
          }, 400);
        }

        const occurredAt = new Date();

        // Resolve Email to Profile
        const { data: profile, error: profErr } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
          
        if (profErr) return json({ error: "lookup_failed" }, 500);
        if (!profile) return json({ error: "user_not_found" }, 404);

        const minuteBucket = Math.floor(occurredAt.getTime() / 60_000);
        const idempotencyKey = createHash("sha256")
          .update(`email|${profile.id}|${rawType}|${minuteBucket}`)
          .digest("hex")
          .slice(0, 32);

        try {
          const result = await recordAttendance({
            userId: profile.id,
            action: rawType as "check_in" | "check_out",
            idempotencyKey,
            occurredAt,
            source: "email_webhook",
            metadata: {
              email,
              subject: data.subject,
              ingested_at: new Date().toISOString(),
            },
          });
          return json({
            ok: result.ok,
            duplicate: result.duplicate,
            session_id: result.sessionId,
            status: result.status,
          }, 200);
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          if (msg.startsWith("not_a_working_day") || msg === "outside_work_window") {
            return json({ error: msg }, 422);
          }
          if (msg === "already_checked_in" || msg === "no_open_session") {
            return json({ error: msg }, 409);
          }
          if (msg === "profile_not_found") return json({ error: msg }, 404);
          return json({ error: "internal_error" }, 500);
        }
      },
    },
  },
});
