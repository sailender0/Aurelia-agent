import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY = "https://connector-gateway.lovable.dev/microsoft_teams";

function teamsHeaders() {
  const lov = process.env.LOVABLE_API_KEY;
  const teams = process.env.MICROSOFT_TEAMS_API_KEY;
  if (!lov) throw new Error("LOVABLE_API_KEY missing");
  if (!teams) throw new Error("MICROSOFT_TEAMS_API_KEY missing — connect Microsoft Teams.");
  return {
    Authorization: `Bearer ${lov}`,
    "X-Connection-Api-Key": teams,
    "Content-Type": "application/json",
  };
}

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r) => r.role === "admin")) throw new Error("Forbidden: admin only");
}

export async function postToTeams(content: string) {
  const { data: setting } = await supabaseAdmin.from("app_settings").select("value").eq("key", "teams_channel").maybeSingle();
  const cfg = (setting?.value ?? {}) as { teamId?: string; channelId?: string };
  if (!cfg.teamId || !cfg.channelId) return { skipped: true };
  const res = await fetch(`${GATEWAY}/teams/${cfg.teamId}/channels/${cfg.channelId}/messages`, {
    method: "POST",
    headers: teamsHeaders(),
    body: JSON.stringify({ body: { contentType: "html", content } }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Teams post failed [${res.status}]: ${t.slice(0, 200)}`);
  }
  return { ok: true };
}

export const teamsListChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const teamsRes = await fetch(`${GATEWAY}/me/joinedTeams`, { headers: teamsHeaders() });
    if (!teamsRes.ok) throw new Error(`Teams list failed [${teamsRes.status}]`);
    const teamsJson = await teamsRes.json();
    const teams = teamsJson.value ?? [];
    const result: any[] = [];
    for (const t of teams.slice(0, 25)) {
      const chRes = await fetch(`${GATEWAY}/teams/${t.id}/channels`, { headers: teamsHeaders() });
      if (!chRes.ok) continue;
      const ch = (await chRes.json()).value ?? [];
      result.push({ id: t.id, displayName: t.displayName, channels: ch.map((c: any) => ({ id: c.id, displayName: c.displayName })) });
    }
    return { teams: result };
  });

export const teamsSaveChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ teamId: z.string().min(1), channelId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await supabaseAdmin.from("app_settings").upsert({ key: "teams_channel", value: data, updated_at: new Date().toISOString() });
    return { ok: true };
  });

export const teamsGetChannel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "teams_channel").maybeSingle();
    return { config: (data?.value ?? null) as { teamId?: string; channelId?: string } | null };
  });

export const teamsTestPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ message: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return await postToTeams(`<b>Aurelia</b> · ${data.message}`);
  });

export const teamsNotifyMyEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    event: z.enum(["check_in", "check_out", "timesheet_submitted"]),
    detail: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase.from("profiles").select("display_name, email").eq("id", userId).maybeSingle();
    const who = prof?.display_name ?? prof?.email ?? "Someone";
    const labels = { check_in: "checked in", check_out: "checked out", timesheet_submitted: "submitted timesheet" };
    return await postToTeams(`<b>${who}</b> ${labels[data.event]}${data.detail ? ` — ${data.detail}` : ""}`);
  });
