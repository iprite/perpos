const BKK = 'Asia/Bangkok';

export interface ParsedAppointment {
  title: string;
  startsAt: string;
}

function bkkToday(): { year: number; month: number; day: number } {
  const now = new Date();
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: BKK, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now)
    .reduce((a, part) => {
      if (part.type !== 'literal') (a as Record<string, number>)[part.type] = Number(part.value);
      return a;
    }, {} as Record<string, number>);
  return { year: p.year, month: p.month, day: p.day };
}

function bkkDateOf(d: Date): { year: number; month: number; day: number } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: BKK, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d)
    .reduce((a, part) => {
      if (part.type !== 'literal') (a as Record<string, number>)[part.type] = Number(part.value);
      return a;
    }, {} as Record<string, number>);
  return { year: p.year, month: p.month, day: p.day };
}

export function parseAppointmentText(text: string): ParsedAppointment | null {
  const input = text.trim();
  if (!input) return null;

  const timeMatch = input.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!timeMatch) return null;
  const hh = Number(timeMatch[1]);
  const mm = Number(timeMatch[2]);

  const today = bkkToday();
  let targetDate = { year: today.year, month: today.month, day: today.day };
  let rest = input.replace(timeMatch[0], '').trim();

  if (/วันนี้|today/i.test(rest)) {
    rest = rest.replace(/วันนี้|today/gi, '').trim();
  } else if (/พรุ่งนี้|tomorrow/i.test(rest)) {
    const d = new Date(`${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}T12:00:00+07:00`);
    d.setDate(d.getDate() + 1);
    targetDate = bkkDateOf(d);
    rest = rest.replace(/พรุ่งนี้|tomorrow/gi, '').trim();
  } else {
    const dmMatch = rest.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
    if (dmMatch) {
      const day = Number(dmMatch[1]);
      const month = Number(dmMatch[2]);
      const year = dmMatch[3] ? Number(dmMatch[3]) : today.year;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        targetDate = { year, month, day };
      }
      rest = rest.replace(dmMatch[0], '').trim();
    } else {
      const isoMatch = rest.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if (isoMatch) {
        targetDate = { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) };
        rest = rest.replace(isoMatch[0], '').trim();
      }
    }
  }

  const title = rest.replace(/\s+/g, ' ').trim();
  if (!title) return null;

  const Y = String(targetDate.year).padStart(4, '0');
  const M = String(targetDate.month).padStart(2, '0');
  const D = String(targetDate.day).padStart(2, '0');
  const H = String(hh).padStart(2, '0');
  const Min = String(mm).padStart(2, '0');

  return { title, startsAt: new Date(`${Y}-${M}-${D}T${H}:${Min}:00+07:00`).toISOString() };
}
