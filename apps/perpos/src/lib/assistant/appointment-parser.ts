const BKK = "Asia/Bangkok";

export type ParsedAppointment = {
  title: string;
  startsAt: string;  // ISO UTC
};

/** Return today's date in Bangkok as { year, month, day } */
function bkkToday() {
  const now = new Date();
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: BKK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).reduce((a, p) => {
    if (p.type !== "literal") (a as any)[p.type] = Number(p.value);
    return a;
  }, {} as Record<string, number>);
  return { year: p.year, month: p.month, day: p.day };
}

/** Parse /a command text: extract title, date, time */
export function parseAppointmentText(text: string): ParsedAppointment | null {
  const input = text.trim();
  if (!input) return null;

  // Extract time: HH:MM or H:MM (24-hour)
  const timeMatch = input.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!timeMatch) return null;
  const hh = Number(timeMatch[1]);
  const mm = Number(timeMatch[2]);

  const today = bkkToday();

  // Determine date
  let targetDate = { year: today.year, month: today.month, day: today.day };

  // Remove time string first
  let rest = input.replace(timeMatch[0], "").trim();

  // Try "วันนี้" / "today"
  if (/วันนี้|today/i.test(rest)) {
    rest = rest.replace(/วันนี้|today/gi, "").trim();
  }
  // "พรุ่งนี้" / "tomorrow"
  else if (/พรุ่งนี้|tomorrow/i.test(rest)) {
    const d = new Date(`${today.year}-${String(today.month).padStart(2,"0")}-${String(today.day).padStart(2,"0")}T12:00:00+07:00`);
    d.setDate(d.getDate() + 1);
    const b = bkkDateOf(d);
    targetDate = b;
    rest = rest.replace(/พรุ่งนี้|tomorrow/gi, "").trim();
  }
  // "DD/MM" or "DD/MM/YYYY"
  else {
    const dmMatch = rest.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
    if (dmMatch) {
      const day   = Number(dmMatch[1]);
      const month = Number(dmMatch[2]);
      const year  = dmMatch[3] ? Number(dmMatch[3]) : today.year;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        targetDate = { year, month, day };
      }
      rest = rest.replace(dmMatch[0], "").trim();
    } else {
      // "YYYY-MM-DD"
      const isoMatch = rest.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if (isoMatch) {
        targetDate = { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) };
        rest = rest.replace(isoMatch[0], "").trim();
      }
      // Otherwise: default to today (no explicit date token found)
    }
  }

  // Clean up trailing punctuation / extra spaces
  const title = rest.replace(/\s+/g, " ").trim();
  if (!title) return null;

  const Y = String(targetDate.year).padStart(4, "0");
  const M = String(targetDate.month).padStart(2, "0");
  const D = String(targetDate.day).padStart(2, "0");
  const H = String(hh).padStart(2, "0");
  const Min = String(mm).padStart(2, "0");

  const startsAt = new Date(`${Y}-${M}-${D}T${H}:${Min}:00+07:00`).toISOString();
  return { title, startsAt };
}

function bkkDateOf(d: Date): { year: number; month: number; day: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: BKK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d).reduce((a, p) => {
    if (p.type !== "literal") (a as any)[p.type] = Number(p.value);
    return a;
  }, {} as Record<string, number>);
  return { year: p.year, month: p.month, day: p.day };
}
