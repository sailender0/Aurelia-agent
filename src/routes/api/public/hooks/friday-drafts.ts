import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateDraftForUser, currentWeekMondayUTC } from "@/lib/draft-generator.server";

export const Route = createFileRoute("/api/public/hooks/friday-drafts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("apikey") ?? request.headers.get("x-cron-secret") ?? request.headers.get("X-Hub-Signature-256");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!auth || (auth !== expected && auth !== process.env.ACTIVITY_INGEST_SECRET)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const weekStart = currentWeekMondayUTC();
        const start = new Date(weekStart + "T00:00:00Z");

        // Eligible: users with at least one session this week
        const { data: sessUsers } = await supabaseAdmin
          .from("work_sessions").select("user_id").gte("check_in", start.toISOString());
        const userIds = Array.from(new Set((sessUsers ?? []).map((r: any) => r.user_id)));

        const results: any[] = [];
        for (const uid of userIds.slice(0, 100)) {
          try {
            const r = await generateDraftForUser(uid, weekStart);
            results.push({ uid, ok: true, ...r });
          } catch (e: any) {
            results.push({ uid, ok: false, error: e.message });
          }
        }
        return Response.json({ weekStart, processed: results.length, results });
        return Response.json({ message: "Handshake Successful", receivedSignature: !!signature, weekStart});
      },
    },
  },
});
