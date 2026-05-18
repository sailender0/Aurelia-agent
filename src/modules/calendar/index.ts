/**
 * modules/calendar — work-day eligibility (weekends + holidays).
 * Pure data-in/data-out. The caller fetches holiday rows; this module reasons over them.
 */
import { isoWeekdayInZone } from "../timezone";

export interface WorkHours {
  start_time: string;           // 'HH:MM:SS'
  end_time: string;             // 'HH:MM:SS'
  working_days: number[];       // ISO 1..7 (1 = Monday, 7 = Sunday)
  grace_window_minutes: number;
}

export interface HolidayRow {
  holiday_date: string;         // 'YYYY-MM-DD'
  name: string;
  is_full_day: boolean;
}

export type DayKind = "working" | "weekend" | "holiday";

/**
 * Classifies a specific business date day type based entirely on inputs.
 */
export function classifyDay(
  workDate: string,
  workHours: WorkHours,
  holidays: HolidayRow[]
): { kind: DayKind; holiday?: HolidayRow } {
  // 1. Evaluate holiday lookup lists
  const holiday = holidays.find((h) => h.holiday_date === workDate && h.is_full_day);
  if (holiday) return { kind: "holiday", holiday };

  // 2. Safely deduce the day of the week to prevent string/number type boundary mismatch
  // workDate is YYYY-MM-DD in the user's zone; treat as that local date at noon to avoid DST drift.
  const weekdayResult = isoWeekdayInZone(new Date(`${workDate}T12:00:00Z`), "UTC");
  
  // Ensure the day value is handled purely as a standard Number matching working_days constraint
  const isoWeekdayNum = typeof weekdayResult === "string" ? parseInt(weekdayResult, 10) : weekdayResult;

  if (!workHours.working_days.includes(isoWeekdayNum)) {
    return { kind: "weekend" };
  }
  
  return { kind: "working" };
}

/** * Enforces grace windows by calculating the day boundary minutes constraint.
 * True when the wall-clock minute-of-day is within [start - grace, end + grace]. 
 */
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
