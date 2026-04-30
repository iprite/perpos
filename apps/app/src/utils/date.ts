const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function parseEnglishDateToISO(value: string): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;

  const m = /^([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/.exec(s);
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  if (!mon) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (!Number.isFinite(day) || !Number.isFinite(year)) return null;
  return `${year}-${pad2(mon)}-${pad2(day)}`;
}

