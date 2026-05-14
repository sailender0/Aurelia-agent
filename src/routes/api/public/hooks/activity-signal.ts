import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SignalSchema = z.object({
  source: z.enum(["jira", "github", "teams", "slack", "calendar", "manual"]),
  signal_type: z.string().min(1).max(64),
  external_user_id: z.string().min(1).max(255).optional(),
  user_email: z.string().email().optional(),
  project_hint: z.string().max(64).nullable().optional(),
  occurred_at: z.string().datetime().optional(),
  duration_minutes: z.number().int().min(0).max(24 * 60).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const BodySchema = z.union([SignalSchema, z.object({ signals: z.array(SignalSchema).min(1).max(500) })]);

async function resolveUserId(s: z.infer<typeof SignalSchema>): Promise<string | null> {
  if (s.external_user_id) {
    const { data } = await supabaseAdmin.from("identity_mappings")
      .select("user_id").eq("source", s.source).eq("external_id", s.external_user_id).maybeSingle();
    if (data?.user_id) return data.user_id;
  }
  if (s.user_email) {
    const { data } = await supabaseAdmin.from("profiles")
      .select("id").eq("email", s.user_email).maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

export const Route = createFileRoute("/api/public/hooks/activity-signal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. Auth Check
        const signature = request.headers.get("x-hub-signature-256") || request.headers.get("X-Hub-Signature-256");
        const auth = request.headers.get("x-ingest-secret");

        if (!signature && (!auth || auth !== process.env.ACTIVITY_INGEST_SECRET)) {
          return new Response("Unauthorized", { status: 401 });
        }

        // 2. Ping Check
        const eventType = request.headers.get("x-github-event");
        if (eventType === "ping") {
          return Response.json({ message: "pong" }, { status: 200 });
        }

        // 3. Parse Body
        let body: unknown;
        try {
          body = await request.json();
        } catch (e) {
          return new Response("Invalid JSON", { status: 400 });
        }

        // 4. Validate & Process
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }

        const list = "signals" in parsed.data ? parsed.data.signals : [parsed.data];
        const rows: any[] = [];
        const skipped: any[] = [];

        for (const s of list) {
          const userId = await resolveUserId(s);
          if (!userId) {
            skipped.push({ source: s.source, ext: s.external_user_id ?? s.user_email, reason: "user_not_mapped" });
            continue;
          }
          rows.push({
            user_id: userId,
            source: s.source,
            signal_type: s.signal_type,
            project_hint: s.project_hint ?? null,
            occurred_at: s.occurred_at ?? new Date().toISOString(),
            duration_minutes: s.duration_minutes ?? null,
            metadata: s.metadata ?? {},
          });
        }

        if (rows.length) {
          const { error } = await supabaseAdmin.from("activity_signals").insert(rows);
          if (error) return Response.json({ error: error.message }, { status: 500 });
        }

        return Response.json({ ingested: rows.length, skipped });
      },
    },
  },
});
