import dayjs from "dayjs";

export type PettyCashLineCommand =
  | { kind: "balance" }
  | { kind: "last"; limit: number }
  | {
      kind: "transaction";
      txnType: "TOP_UP" | "SPEND";
      amount: number;
      occurredAt: string;
      title: string;
      categoryInput: string | null;
      referenceUrl: string | null;
      rawText: string;
    };

function joinTitleParts(parts: Array<string | null | undefined>) {
  const s = parts
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

function pickFirstUrl(text: string) {
  const m = String(text ?? "").match(/https?:\/\/\S+/i);
  return m ? String(m[0]) : null;
}

function pickFirstHashtag(text: string) {
  const m = String(text ?? "").match(/#([^\s()]+)/);
  return m ? String(m[1]) : null;
}

function pickFirstIsoDate(text: string) {
  const m = String(text ?? "").match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const s = m ? String(m[1]) : null;
  if (!s) return null;
  if (!dayjs(s, "YYYY-MM-DD", true).isValid()) return null;
  return s;
}

function parseAmountWithSign(text: string) {
  const m = String(text ?? "").match(/([+-])\s*([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!m) return null;
  const sign = String(m[1]);
  const amount = Number(String(m[2]));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { sign, amount, match: String(m[0]) };
}

function parseAmountPlain(text: string) {
  const s = String(text ?? "")
    .trim()
    .replace(/,/g, "")
    .replace(/\s+/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseSlashMultiLine(text: string): PettyCashLineCommand | null {
  const raw = String(text ?? "");
  if (!/^\s*\/pc\b/i.test(raw)) return null;

  const lines = raw
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const head = String(lines[0] ?? "").trim();
  const m = head.match(/^\/pc\s+(in|out|bal|last)(?:\s+(\d{1,2}))?$/i);
  if (!m) return null;
  const action = String(m[1]).toLowerCase();

  if (action === "bal") return { kind: "balance" };
  if (action === "last") {
    const limitRaw = Number(m[2] ?? lines[1] ?? 5);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, Math.floor(limitRaw))) : 5;
    return { kind: "last", limit };
  }

  const amount = parseAmountPlain(lines[1] ?? "");
  if (!amount) return null;

  const occurredAt = pickFirstIsoDate(raw) ?? dayjs().format("YYYY-MM-DD");
  const referenceUrl = pickFirstUrl(raw);

  if (action === "in") {
    const baseTitle = String(lines[2] ?? "").trim() || "เติมเงินสดย่อย";
    const extra = lines.slice(3).join(" ").trim();
    const title = joinTitleParts([baseTitle, extra]);
    return {
      kind: "transaction",
      txnType: "TOP_UP",
      amount,
      occurredAt,
      title,
      categoryInput: null,
      referenceUrl,
      rawText: raw.trim(),
    };
  }

  const categoryInput = String(lines[2] ?? "").trim() || null;
  const baseTitle = String(lines[3] ?? "").trim() || String(categoryInput ?? "").trim() || "ใช้เงินสดย่อย";
  const extra = lines.slice(4).join(" ").trim();
  const title = joinTitleParts([baseTitle, extra]);
  return {
    kind: "transaction",
    txnType: "SPEND",
    amount,
    occurredAt,
    title,
    categoryInput,
    referenceUrl,
    rawText: raw.trim(),
  };
}

function parseStrict(text: string): PettyCashLineCommand | null {
  const t = String(text ?? "").trim();
  if (!/^pc\s*\|/i.test(t)) return null;
  const parts = t.split("|").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  if (String(parts[0]).toLowerCase() !== "pc") return null;

  const action = String(parts[1]).toUpperCase();
  if (action === "BAL") return { kind: "balance" };
  if (action === "LAST") {
    const kv = Object.fromEntries(parts.slice(2).map((p) => {
      const i = p.indexOf("=");
      if (i === -1) return [p.toLowerCase(), ""];
      return [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()];
    }));
    const limitRaw = Number(kv.limit || 5);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, Math.floor(limitRaw))) : 5;
    return { kind: "last", limit };
  }

  const txnType = action === "IN" ? "TOP_UP" : action === "OUT" ? "SPEND" : null;
  if (!txnType) return null;

  const kv = Object.fromEntries(parts.slice(2).map((p) => {
    const i = p.indexOf("=");
    if (i === -1) return [p.toLowerCase(), ""];
    return [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()];
  }));

  const amount = Number(kv.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const title = String(kv.title ?? "").trim();
  if (!title) return null;

  const occurredAt = dayjs(String(kv.date ?? ""), "YYYY-MM-DD", true).isValid() ? String(kv.date) : dayjs().format("YYYY-MM-DD");
  const categoryInput = String(kv.category ?? "").trim() || null;
  const referenceUrl = String(kv.ref ?? "").trim() || null;

  const extra = String(kv.note ?? "").trim();
  const mergedTitle = joinTitleParts([title, extra]);

  return { kind: "transaction", txnType, amount, occurredAt, title: mergedTitle, categoryInput, referenceUrl, rawText: t };
}

function parseHuman(text: string): PettyCashLineCommand | null {
  const t = String(text ?? "").trim();

  const lower = t.toLowerCase();
  const isPcPrefix = /^pc\b/i.test(t) || /^เงินสดย่อย\b/.test(t);
  if (!isPcPrefix) return null;

  if (lower.includes("ยอด") && !/[+-]\s*\d/.test(t)) return { kind: "balance" };
  const lastMatch = t.match(/ล่าสุด\s*(\d{1,2})/);
  if (lastMatch) {
    const n = Number(lastMatch[1]);
    const limit = Number.isFinite(n) ? Math.max(1, Math.min(20, Math.floor(n))) : 5;
    return { kind: "last", limit };
  }

  const amt = parseAmountWithSign(t);
  if (!amt) return null;

  const txnType = amt.sign === "+" ? "TOP_UP" : "SPEND";
  const occurredAt = pickFirstIsoDate(t) ?? dayjs().format("YYYY-MM-DD");
  const categoryInput = pickFirstHashtag(t);
  const referenceUrl = pickFirstUrl(t);
  const noteInParen = (() => {
    const m = t.match(/\(([^)]+)\)/);
    return m ? String(m[1]).trim() : null;
  })();

  const afterAmt = t.split(amt.match).slice(1).join(amt.match).trim();
  const titlePart = afterAmt
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, " ")
    .replace(/#([^\s()]+)/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\([^)]*\)/g, " ")
    .trim();

  const title = titlePart.replace(/^[-–—:：]+/, "").trim();
  if (!title) return null;

  const mergedTitle = joinTitleParts([title, noteInParen]);

  return {
    kind: "transaction",
    txnType,
    amount: amt.amount,
    occurredAt,
    title: mergedTitle,
    categoryInput: categoryInput ? String(categoryInput).trim() : null,
    referenceUrl,
    rawText: t,
  };
}

export function parsePettyCashLineText(text: string) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  return parseSlashMultiLine(t) ?? parseStrict(t) ?? parseHuman(t);
}
