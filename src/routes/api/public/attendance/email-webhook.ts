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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cleanHtmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractField(text: string, keyName: string): string | null {
  const regex = new RegExp(`${keyName}\\s*:\\s*([^\\n\\r\\s<>]+)`, "i");
  const match = regex.exec(text);
  return match ? match[1].trim() : null;
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

        let rawBody = "";
        try {
          rawBody = await request.text();
        } catch (err) {
          return json({ error: "failed_to_read_request_stream" }, 400);
        }

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return json({ error: "invalid_json_payload" }, 400);
        }

        const dataContext = payload?.data || payload;
        
        // 🔄 COMBINE BOTH SOURCES: Look inside the email text body AND the subject line!
        const rawHtmlSource = dataContext?.html || dataContext?.text || "";
        const subjectSource = dataContext?.subject || "";
        
        const cleanContent = cleanHtmlToText(typeof rawHtmlSource === "string" ? rawHtmlSource : JSON.stringify(rawHtmlSource));
        
        // Merge them together so extractField scans both areas
        const finalSearchText = `${subjectSource}\n${cleanContent}\n${rawBody}`;

        const secret = extractField(finalSearchText, "secret");
        const email = extractField(finalSearchText, "email");
        let type = extractField(finalSearchText, "type");

        if (!secret || !email || !type) {
          console.error("[email-webhook] Parsing failed. Searched Scope:", finalSearchText);
          return json({ 
            error: "empty_email_body", 
            diagnostics: {
              scannedText: finalSearchText,
              extracted: { secret: !!secret, email: !!email, type: !!type }
            }
          }, 400);
        }

        const headerSecret = request.headers.get("x-webhook-secret") ?? "";
        const providedSecret = headerSecret || secret;
        if (!safeEqual(providedSecret, expectedSecret)) {
          return json({ error: "unauthorized" }, 401);
        }

        const normalizedEmail = email.toLowerCase();
        let normalizedType = type.toLowerCase().replace(/\s+/g, "_");

        if (normalizedType === "clock_in" || normalizedType === "check_in") normalizedType = "check_in";
        if (normalizedType === "clock_out" || normalizedType === "check_out") normalizedType = "check_out";

        const FieldsSchema = z.object({
          email: z.string().email().max(255),
          type: z.enum(["check_in", "check_out"]),
        });

        const fieldCheck = FieldsSchema.safeParse({ email: normalizedEmail, type: normalizedType });
        if (!fieldCheck.success) {
          return json({ 
            error: "missing_or_invalid_fields", 
            details: fieldCheck.error.flatten(),
            parsed: { email: normalizedEmail, type: normalizedType }
          }, 400);
        }

        const occurredAt = new Date();

        const { data: profile, error: profErr } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", normalizedEmail)
          .maybeSingle();
          
        if (profErr) return json({ error: "lookup_failed" }, 500);
        if (!profile) return json({ error: "user_not_found" }, 404);

        const minuteBucket = Math.floor(occurredAt.getTime() / 60_000);
        const idempotencyKey = createHash("sha256")
          .update(`email|${profile.id}|${normalizedType}|${minuteBucket}`)
          .digest("hex")
          .slice(0, 32);

        try {
          const result = await recordAttendance({
            userId: profile.id,
            action: normalizedType as "check_in" | "check_out",
            idempotencyKey,
            occurredAt,
            source: "email_webhook",
            metadata: {
              email: normalizedEmail,
              subject: subjectSource,
              ingested_at: occurredAt.toISOString(),
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
