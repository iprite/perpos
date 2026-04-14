export function normalizeImportTempId(v: string) {
  const raw = String(v ?? "").trim();
  if (!raw) return "";

  const compact = raw
    .toUpperCase()
    .replace(/×/g, "X")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "");

  if (!compact) return "";

  if (/^\d+(\.0+)?$/.test(raw)) {
    return raw.split(".")[0].replace(/^0+(?=\d)/, "");
  }

  if (/^\d+$/.test(compact)) {
    return compact.replace(/^0+(?=\d)/, "");
  }

  return compact;
}

