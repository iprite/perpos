function normalizeBase(s: string) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_/()]+/g, "")
    .replace(/[.،,]+/g, "")
    .replace(/[:：]+/g, "");
}

function buildKeys(name: string) {
  const raw = String(name ?? "").trim();
  const noPrefix = raw.replace(/^ค่า/, "");
  const keys = [normalizeBase(raw)];
  const k2 = normalizeBase(noPrefix);
  if (k2 && k2 !== keys[0]) keys.push(k2);
  return keys.filter(Boolean);
}

function levenshtein(a: string, b: string) {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const v0 = new Array(t.length + 1).fill(0);
  const v1 = new Array(t.length + 1).fill(0);
  for (let i = 0; i <= t.length; i++) v0[i] = i;
  for (let i = 0; i < s.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < t.length; j++) {
      const cost = s[i] === t[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= t.length; j++) v0[j] = v1[j];
  }
  return v1[t.length];
}

export function resolvePettyCashCategory(args: { input: string | null; allowed: string[] }) {
  const inputRaw = String(args.input ?? "").trim();
  if (!inputRaw) return { ok: true as const, categoryName: null as string | null, suggestions: [] as string[] };

  const inputKey = normalizeBase(inputRaw.replace(/^#/, ""));
  const entries = args.allowed
    .map((name) => ({ name, keys: buildKeys(name) }))
    .filter((x) => x.keys.length);

  for (const e of entries) {
    if (e.keys.includes(inputKey)) return { ok: true as const, categoryName: e.name, suggestions: [] as string[] };
  }

  const ranked = entries
    .map((e) => ({
      name: e.name,
      score: Math.min(...e.keys.map((k) => levenshtein(inputKey, k))),
    }))
    .sort((a, b) => a.score - b.score)
    .map((x) => x.name);

  const uniq: string[] = [];
  for (const n of ranked) {
    if (!uniq.includes(n)) uniq.push(n);
    if (uniq.length >= 5) break;
  }

  return { ok: false as const, categoryName: null as string | null, suggestions: uniq };
}

