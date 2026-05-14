import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WeekInput = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export const generateAITimesheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => WeekInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const weekStart = new Date(data.weekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Pull signals + sessions for the week
    const [{ data: sessions }, { data: signals }, { data: projects }] = await Promise.all([
      supabase.from("work_sessions").select("*").eq("user_id", userId)
        .gte("check_in", weekStart.toISOString()).lt("check_in", weekEnd.toISOString()),
      supabase.from("activity_signals").select("*").eq("user_id", userId)
        .gte("occurred_at", weekStart.toISOString()).lt("occurred_at", weekEnd.toISOString()),
      supabase.from("projects").select("id, name, code, client_id, clients(name)"),
    ]);

    const totalHours = (sessions ?? []).reduce((sum, s) => {
      if (!s.check_out) return sum + 0;
      return sum + (new Date(s.check_out).getTime() - new Date(s.check_in).getTime()) / 3_600_000;
    }, 0);

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const projectList = (projects ?? []).map((p: any) => `${p.code} (${p.name} / ${p.clients?.name ?? "?"})`).join(", ") || "none configured";

    const prompt = `Reconstruct a weekly timesheet for an enterprise consultant.
Total tracked hours from check-ins: ${totalHours.toFixed(1)}h
Activity signals: ${(signals ?? []).length} events
Signal samples: ${JSON.stringify((signals ?? []).slice(0, 20).map((s) => ({ src: s.source, type: s.signal_type, hint: s.project_hint, mins: s.duration_minutes })))}
Available projects: ${projectList}

Return a JSON object with: { "summary": "...", "confidence": 0.0-1.0, "entries": [{ "category": "project|internal|support|leave|unclassified", "project_code": "PHX or null", "hours": number, "confidence": 0.0-1.0, "rationale": "..." }] }
Hours must sum approximately to ${Math.max(totalHours, 1).toFixed(1)}. Be conservative; flag low-confidence allocations as "unclassified".`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an AI workforce attribution engine. Output ONLY valid JSON, no markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) throw new Error("AI rate limit exceeded — try again in a minute.");
      if (aiRes.status === 402) throw new Error("AI credits exhausted — add credits in Workspace > Usage.");
      throw new Error(`AI gateway error ${aiRes.status}`);
    }
    const aiJson = await aiRes.json();
    const text = aiJson.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(text.replace(/^```json|```$/g, "").trim());
    } catch {
      parsed = { summary: "AI output unparseable", confidence: 0, entries: [] };
    }

    // Upsert draft
    const { data: existing } = await supabase
      .from("draft_timesheets")
      .select("id")
      .eq("user_id", userId)
      .eq("week_start", data.weekStart)
      .maybeSingle();

    let timesheetId = existing?.id;
    if (!timesheetId) {
      const { data: ins, error } = await supabase.from("draft_timesheets").insert({
        user_id: userId, week_start: data.weekStart, status: "draft",
        ai_summary: parsed.summary, ai_confidence: parsed.confidence ?? 0,
      }).select("id").single();
      if (error) throw error;
      timesheetId = ins.id;
    } else {
      await supabase.from("draft_timesheets").update({
        ai_summary: parsed.summary, ai_confidence: parsed.confidence ?? 0, updated_at: new Date().toISOString(),
      }).eq("id", timesheetId);
      await supabase.from("timesheet_entries").delete().eq("timesheet_id", timesheetId);
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
    if (entries.length) await supabase.from("timesheet_entries").insert(entries);

    return { timesheetId, summary: parsed.summary, confidence: parsed.confidence ?? 0, totalHours };
  });
