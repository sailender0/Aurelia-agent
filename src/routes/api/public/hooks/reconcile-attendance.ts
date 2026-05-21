/**
 * Manual / cron trigger for end-of-day reconciliation.
 * Cron is already wired in pg_cron (hourly), but this gives us a
 * pokeable HTTP surface for admins / smoke tests.
 *
 * POST /api/public/hooks/reconcile-attendance
 *   ?cutoff_hours=14  (default 14)
 *   ?default_hours=8  (default 8)
 *
 * Auth: apikey header must equal SUPABASE_PUBLISHABLE_KEY.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/reconcile-attendance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!auth || auth !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const url = new URL(request.url);
        const cutoff = Number(url.searchParams.get("cutoff_hours") ?? 14);
        const def = Number(url.searchParams.get("default_hours") ?? 8);
        const { data, error } = await supabaseAdmin.rpc(
          "reconcile_missed_checkouts",
          { p_cutoff_hours: cutoff, p_default_hours: def } as never,
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, result: data });
      },
    },
  },
});
