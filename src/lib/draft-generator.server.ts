import { supabaseAdmin } from "@/integrations/supabase/client.server";

function mondayOfDate(d: Date): string {
  const x = new Date(d);
  const day = (x.getUTCDay() + 6) % 7; // 0=Mon
  x.setUTCDate(x.getUTCDate() - day);
  return x.toISOString().slice(0, 10);
}

export async function generateDraftForUser(userId: string, weekStart: string) {
  const start = new Date(weekStart + "T00:00:00Z");
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);

  const [{ data: sessions }, { data: signals }, { data: projects }] = await Promise.all([
    supabaseAdmin.from("work_sessions").select("*").eq("user_id", userId)
      .gte("check_in", start.toISOString()).lt("check_in", end.toISOString()),
    supabaseAdmin.from("activity_signals").select("*").eq("user_id", userId)
      .gte("occurred_at", start.toISOString()).lt("occurred_at", end.toISOString()),
    supabaseAdmin.from("projects").select("id, name, code, client_id, clients(name)"),
  ]);

  const totalHours = (sessions ?? []).reduce((s, x: any) => {
    if (!x.check_out) return s;
    return s + (new Date(x.check_out).getTime() - new Date(x.check_in).getTime()) / 3_600_000;
  }, 0);

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const projectList = (projects ?? []).map((p: any) => `${p.code} (${p.name} / ${p.clients?.name ?? "?"})`).join(", ") || "none";
  const prompt = `Reconstruct a weekly timesheet.
Tracked hours: ${totalHours.toFixed(1)}h. Signals: ${(signals ?? []).length}.
Sample signals: ${JSON.stringify((signals ?? []).slice(0, 20).map((s: any) => ({ src: s.source, type: s.signal_type, hint: s.project_hint, mins: s.duration_minutes })))}
Projects: ${projectList}
Return JSON: { "summary": "...", "confidence": 0..1, "entries": [{ "category": "project|internal|support|leave|unclassified", "project_code": "PHX|null", "hours": number, "confidence": 0..1, "rationale": "..." }] }
Hours sum ≈ ${Math.max(totalHours, 1).toFixed(1)}.`;

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "AI workforce attribution engine. Output ONLY valid JSON." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!aiRes.ok) throw new Error(`AI ${aiRes.status}`);
  const aiJson = await aiRes.json();
  const text = aiJson.choices?.[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try { parsed = JSON.parse(text.replace(/^```json|```$/g, "").trim()); }
  catch { parsed = { summary: "AI output unparseable", confidence: 0, entries: [] }; }

  const { data: existing } = await supabaseAdmin.from("draft_timesheets")
    .select("id").eq("user_id", userId).eq("week_start", weekStart).maybeSingle();

  let timesheetId = existing?.id;
  if (!timesheetId) {
    const { data: ins, error } = await supabaseAdmin.from("draft_timesheets").insert({
      user_id: userId, week_start: weekStart, status: "draft",
      ai_summary: parsed.summary, ai_confidence: parsed.confidence ?? 0,
    }).select("id").single();
    if (error) throw error;
    timesheetId = ins.id;
  } else {
    await supabaseAdmin.from("draft_timesheets").update({
      ai_summary: parsed.summary, ai_confidence: parsed.confidence ?? 0, updated_at: new Date().toISOString(),
    }).eq("id", timesheetId);
    await supabaseAdmin.from("timesheet_entries").delete().eq("timesheet_id", timesheetId);
  }

  const projectByCode = new Map((projects ?? []).map((p: any) => [p.code, p.id]));
  const entries = (parsed.entries ?? []).map((e: any) => ({
    timesheet_id: timesheetId,
    project_id: e.project_code ? projectByCode.get(e.project_code) ?? null : null,
    category: e.category ?? "unclassified",
    hours: Number(e.hours) || 0,
    ai_confidence: e.confidence ?? null,
    ai_rationale: e.rationale ?? null,
  }));
  if (entries.length) await supabaseAdmin.from("timesheet_entries").insert(entries);

  return { timesheetId, totalHours, entries: entries.length };
}

export function currentWeekMondayUTC(): string {
  return mondayOfDate(new Date());
}
