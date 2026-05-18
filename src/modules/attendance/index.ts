/**
 * modules/attendance — orchestrates check-in / check-out.
 *
 * Boundary rules:
 *   - Only this module talks to attendance_sessions / attendance_events / outbox_events.
 *   - It composes the Timezone and Calendar modules; it does NOT inline their logic.
 *   - The DB-side `record_attendance_action` SQL function performs the atomic
 *     transaction (idempotency + session + event + outbox). This file is the
 *     server-side gateway that loads context (work hours, holidays, timezone),
 *     enforces business rules, and then calls the RPC.
 *
 * Server-only — imports the admin client. Do NOT import from browser code.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  workDateInZone,
  minutesOfDayInZone,
  isValidTimezone,
} from "../timezone";
import {
  classifyDay,
  isWithinWorkWindow,
  type HolidayRow,
  type WorkHours,
} from "../calendar";

export type AttendanceAction = "check_in" | "check_out";

export interface AttendanceCommand {
  userId: string;
  action: AttendanceAction;
  idempotencyKey: string;        // caller-generated; >= 8 chars
  occurredAt?: Date;             // defaults to now()
  source?: string;               // 'web' | 'teams' | 'cron'
  metadata?: Record<string, unknown>;
}

export interface AttendanceResult {
  ok: boolean;
  duplicate: boolean;
  sessionId?: string;
  eventId?: string;
  status?: "open" | "closed" | "void";
}

interface UserContext {
  timezone: string;
  workHours: WorkHours;
  holidays: HolidayRow[];
}

async function loadUserContext(userId: string): Promise<UserContext> {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("timezone_preference, work_hours_id, calendar_id")
    .eq("id", userId)
    .maybeSingle();
  if (error || !profile) throw new Error("profile_not_found");

  const timezone = isValidTimezone(profile.timezone_preference)
    ? profile.timezone_preference
    : "UTC";

  let workHours: WorkHours = {
    start_time: "09:00:00",
    end_time: "17:00:00",
    working_days: [1, 2, 3, 4, 5],
    grace_window_minutes: 15,
  };
  if (profile.work_hours_id) {
    const { data: wh } = await supabaseAdmin
      .from("user_work_hours")
      .select("start_time, end_time, working_days, grace_window_minutes")
      .eq("id", profile.work_hours_id)
      .maybeSingle();
    if (wh) workHours = wh as unknown as WorkHours;
  }

  let holidays: HolidayRow[] = [];
  if (profile.calendar_id) {
    const { data: hs } = await supabaseAdmin
      .from("holidays")
      .select("holiday_date, name, is_full_day")
      .eq("calendar_id", profile.calendar_id);
    holidays = (hs ?? []) as HolidayRow[];
  }

  return { timezone, workHours, holidays };
}

/**
 * Core entrypoint. Validates business rules, then delegates the atomic write
 * (idempotency + session + event + outbox) to the SQL function.
 *
 * Throws Error with stable codes: 'unauthenticated', 'invalid_timezone',
 * 'not_a_working_day', 'outside_work_window', 'already_checked_in',
 * 'no_open_session', 'duplicate' (returned, not thrown).
 */
export async function recordAttendance(cmd: AttendanceCommand): Promise<AttendanceResult> {
  if (!cmd.userId) throw new Error("unauthenticated");
  if (!cmd.idempotencyKey || cmd.idempotencyKey.length < 8) {
    throw new Error("idempotency_key_required");
  }

  const ctx = await loadUserContext(cmd.userId);
  const occurredAt = cmd.occurredAt ?? new Date();
  const workDate = workDateInZone(occurredAt, ctx.timezone);

  // Business rules (only on check-in; check-out is always allowed if a session is open)
  if (cmd.action === "check_in") {
    const cls = classifyDay(workDate, ctx.workHours, ctx.holidays);
    if (cls.kind !== "working") {
      throw new Error(cls.kind === "holiday" ? "not_a_working_day:holiday" : "not_a_working_day:weekend");
    }
    if (!isWithinWorkWindow(minutesOfDayInZone(occurredAt, ctx.timezone), ctx.workHours)) {
      throw new Error("outside_work_window");
    }
  }

  // Atomic write happens here. The RPC enforces idempotency + outbox in one tx.
  const { data, error } = await supabaseAdmin.rpc("record_attendance_action" as any, {
    p_action: cmd.action,
    p_idempotency_key: cmd.idempotencyKey,
    p_work_date: workDate,
    p_occurred_at: occurredAt.toISOString(),
    p_source: cmd.source ?? "web",
    p_metadata: cmd.metadata ?? {},
  });
  if (error) throw new Error(error.message);

  const r = data as {
    ok: boolean;
    duplicate: boolean;
    session_id?: string;
    event_id?: string;
    status?: "open" | "closed" | "void";
  };
  return {
    ok: r.ok,
    duplicate: r.duplicate,
    sessionId: r.session_id,
    eventId: r.event_id,
    status: r.status,
  };
}
