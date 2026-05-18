/**
 * modules/calendar — work-day eligibility (weekends + holidays).
 * Pure data-in/data-out. The caller fetches holiday rows; this module reasons over them.
 */
import { isoWeekdayInZone } from "../timezone";

export interface WorkHours {
  start_time: string; // 'HH:MM:SS'
  end_time: string;   // 'HH:MM:SS'
  working_days: number[]; // ISO 1..7
  grace_window_minutes: number;
}

export interface HolidayRow {
  holiday_date: string; // YYYY-MM-DD
  name: string;
  is_full_day: boolean;
}

export type DayKind = "working" | "weekend" | "holiday";

export function classifyDay(
  workDate: string,
  workHours: WorkHours,
  holidays: HolidayRow[]
): { kind: DayKind; holiday?: HolidayRow } {
  const holiday = holidays.find((h) => h.holiday_date === workDate && h.is_full_day);
  if (holiday) return { kind: "holiday", holiday };

  // workDate is YYYY-MM-DD in the user's zone; treat as that local date at noon to avoid DST drift.
  const iso = isoWeekdayInZone(new Date(`${workDate}T12:00:00Z`), "UTC");
  if (!workHours.working_days.includes(iso)) return { kind: "weekend" };
  return { kind: "working" };
}

/** True when the wall-clock minute-of-day is within [start - grace, end + grace]. */
export function isWithinWorkWindow(
  minutesOfDay: number,
  workHours: WorkHours
): boolean {
  const [sh, sm] = workHours.start_time.split(":").map(Number);
  const [eh, em] = workHours.end_time.split(":").map(Number);
  const start = sh * 60 + sm - workHours.grace_window_minutes;
  const end = eh * 60 + em + workHours.grace_window_minutes;
  return minutesOfDay >= start && minutesOfDay <= end;
}
