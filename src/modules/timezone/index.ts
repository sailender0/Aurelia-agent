/**
 * modules/timezone — pure helpers for IANA timezone math.
 * No I/O, no Supabase, no React. Safe in browser and server bundles.
 */

/**
 * Returns the IANA-local "work date" (YYYY-MM-DD) for a given instant.
 * DST-safe: uses Intl.DateTimeFormat in the target zone instead of UTC offset math.
 */
export function workDateInZone(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/** ISO weekday in the target zone (1=Mon..7=Sun). */
export function isoWeekdayInZone(instant: Date, timezone: string): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(instant);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[name] ?? 0;
}

/** Wall-clock time (HH:MM, 24h) in the target zone. */
export function wallTimeInZone(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}

/** Minutes since midnight in the target zone. */
export function minutesOfDayInZone(instant: Date, timezone: string): number {
  const [h, m] = wallTimeInZone(instant, timezone).split(":").map(Number);
  return h * 60 + m;
}

/** Validates that a string is a known IANA timezone for the current runtime. */
export function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; }
  catch { return false; }
}

/**
 * Advanced Deducer: Evaluates if a midnight-crossing checkout belongs to the previous business day.
 * If the wall-clock time falls before a cutoff hour (e.g., 4:00 AM), it safely rolls back the business date.
 */
export function calculateBusinessWorkDate(
  instant: Date,
  timezone: string,
  cutoffHour: number = 4
): string {
  const localWallTime = wallTimeInZone(instant, timezone);
  const [hour] = localWallTime.split(":").map(Number);
  const rawDateStr = workDateInZone(instant, timezone);

  if (hour < cutoffHour) {
    // Construct a safe intermediate date string and step backwards by one full day
    const parsedDate = new Date(`${rawDateStr}T12:00:00Z`);
    parsedDate.setUTCDate(parsedDate.getUTCDate() - 1);
    
    const y = parsedDate.getUTCFullYear();
    const m = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsedDate.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return rawDateStr;
}
