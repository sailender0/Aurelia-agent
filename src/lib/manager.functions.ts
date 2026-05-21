/**
 * Manager-side server functions — approve / reject draft timesheets.
 * Uses supabaseAdmin to write the timesheet status, append the approval row,
 * and enqueue an outbox event in one server-side flow. The is_manager_of()
 * check happens before any write to keep authority server-enforced.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit } from "@/modules/audit";

export const decideTimesheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      timesheetId: z.string().uuid(),
      decision: z.enum(["approved", "rejected"]),
      comment: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Load the timesheet + verify manager owns the report.
    const { data: ts, error: tsErr } = await supabaseAdmin
      .from("draft_timesheets")
      .select("id, user_id, week_start, status")
      .eq("id", data.timesheetId)
      .maybeSingle();
    if (tsErr) throw new Error(tsErr.message);
    if (!ts) throw new Error("timesheet_not_found");

    const { data: report } = await supabaseAdmin
      .from("profiles")
      .select("id, manager_id")
      .eq("id", ts.user_id)
      .maybeSingle();
    if (!report || report.manager_id !== userId) {
      throw new Error("forbidden: not a direct report");
    }

    // 1) Update timesheet status
    const { error: upErr } = await supabaseAdmin
      .from("draft_timesheets")
      .update({ status: data.decision })
      .eq("id", data.timesheetId);
    if (upErr) throw new Error(upErr.message);

    // 2) Insert approval row
    const { error: apErr } = await supabaseAdmin
      .from("timesheet_approvals")
      .insert({
        timesheet_id: data.timesheetId,
        manager_id: userId,
        decision: data.decision,
        comment: data.comment ?? null,
      });
    if (apErr) throw new Error(apErr.message);

    // 3) Outbox payload → downstream consumers (Teams notify, email, etc.)
    const eventType =
      data.decision === "approved"
        ? "timesheet_approved"
        : "timesheet_rejected";
    const { error: oxErr } = await supabaseAdmin
      .from("outbox_events")
      .insert({
        event_type: eventType,
        payload: {
          timesheet_id: data.timesheetId,
          user_id: ts.user_id,
          manager_id: userId,
          week_start: ts.week_start,
          decision: data.decision,
          comment: data.comment ?? null,
          decided_at: new Date().toISOString(),
        },
        status: "pending",
      });
    if (oxErr) throw new Error(oxErr.message);

    // 4) Decision-trace audit row
    await writeAudit({
      actorId: userId,
      actorKind: "user",
      action: `timesheet.${data.decision}`,
      targetTable: "draft_timesheets",
      targetId: data.timesheetId,
      before: { status: ts.status },
      after: { status: data.decision },
      context: {
        report_user_id: ts.user_id,
        week_start: ts.week_start,
        comment: data.comment ?? null,
      },
    });

    return { ok: true, decision: data.decision };
  });

/**
 * Manager dashboard read — direct reports + their open/closed attendance for today
 * + pending timesheets. One server call, no `!inner` joins so RLS-filtered rows
 * never silently disappear.
 */
export const getManagerOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const { data: team, error: teamErr } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, employment_type, timezone_preference")
      .eq("manager_id", userId);
    if (teamErr) throw new Error(teamErr.message);

    const ids = (team ?? []).map((m) => m.id);
    if (ids.length === 0) {
      return { team: [], pending: [], sessions: [] };
    }

    const today = new Date().toISOString().slice(0, 10);

    const [pendingRes, sessionsRes] = await Promise.all([
      supabaseAdmin
        .from("draft_timesheets")
        .select("id, user_id, week_start, status, ai_summary, ai_confidence, submitted_at")
        .in("user_id", ids)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: true }),
      supabaseAdmin
        .from("attendance_sessions")
        .select("id, user_id, work_date, check_in_time, check_out_time, status")
        .in("user_id", ids)
        .eq("work_date", today),
    ]);
    if (pendingRes.error) throw new Error(pendingRes.error.message);
    if (sessionsRes.error) throw new Error(sessionsRes.error.message);

    // Decorate pending with display_name from team roster (no inner join needed).
    const byId = new Map((team ?? []).map((m) => [m.id, m]));
    const pending = (pendingRes.data ?? []).map((t) => ({
      ...t,
      display_name: byId.get(t.user_id)?.display_name ?? "Team member",
    }));

    return {
      team: team ?? [],
      pending,
      sessions: sessionsRes.data ?? [],
    };
  });
