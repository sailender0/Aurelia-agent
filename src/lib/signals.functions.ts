import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMySignals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const since = new Date(); since.setDate(since.getDate() - 14);
    const { data, error } = await supabase.from("activity_signals")
      .select("*").eq("user_id", userId).gte("occurred_at", since.toISOString())
      .order("occurred_at", { ascending: false }).limit(200);
    if (error) throw error;
    return { signals: data ?? [] };
  });

export const upsertIdentityMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    source: z.enum(["jira", "github", "teams", "slack", "calendar", "manual"]),
    external_id: z.string().min(1).max(255),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("identity_mappings")
      .upsert({ user_id: userId, source: data.source, external_id: data.external_id });
    if (error) throw error;
    return { ok: true };
  });

export const listMyMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("identity_mappings").select("*").eq("user_id", userId);
    return { mappings: data ?? [] };
  });

export const seedDemoSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: projects } = await supabase.from("projects").select("code").limit(5);
    const codes = (projects ?? []).map((p) => p.code);
    if (codes.length === 0) throw new Error("No projects yet — ask an admin to seed projects first.");
    const sources = ["jira", "github", "teams", "calendar"] as const;
    const types: Record<string, string[]> = {
      jira: ["issue.updated", "issue.transitioned", "comment.added"],
      github: ["pr.opened", "commit.pushed", "review.submitted"],
      teams: ["message.sent", "meeting.attended"],
      calendar: ["meeting.attended"],
    };
    const rows = [];
    const now = Date.now();
    for (let i = 0; i < 40; i++) {
      const src = sources[i % sources.length];
      const tArr = types[src];
      rows.push({
        user_id: userId,
        source: src,
        signal_type: tArr[i % tArr.length],
        project_hint: codes[i % codes.length],
        occurred_at: new Date(now - i * 3_600_000).toISOString(),
        duration_minutes: src === "teams" || src === "calendar" ? 15 + (i % 4) * 15 : null,
        metadata: { demo: true },
      });
    }
    const { error } = await supabase.from("activity_signals").insert(rows);
    if (error) throw error;
    return { count: rows.length };
  });
