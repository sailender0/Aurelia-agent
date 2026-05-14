export function mondayOf(d: Date = new Date()): string {
  const x = new Date(d);
  const day = x.getDay(); // 0..6 Sun..Sat
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

export function fmtHours(h: number) {
  return `${h.toFixed(1)}h`;
}
