import crypto from "crypto";

type OAuthStatePayload = {
  pid: string;
  iat: number;
  nonce: string;
};

function base64UrlEncode(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeToString(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(`${b64}${pad}`, "base64").toString("utf8");
}

function hmacSha256Base64Url(secret: string, data: string) {
  const h = crypto.createHmac("sha256", secret).update(data).digest();
  return base64UrlEncode(h);
}

export function createSignedOAuthState(profileId: string) {
  const secret = String(process.env.GOOGLE_OAUTH_STATE_SECRET ?? "").trim();
  if (!secret) throw new Error("Missing GOOGLE_OAUTH_STATE_SECRET");
  const payload: OAuthStatePayload = {
    pid: profileId,
    iat: Date.now(),
    nonce: crypto.randomUUID(),
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = hmacSha256Base64Url(secret, encoded);
  return `${encoded}.${sig}`;
}

export function verifySignedOAuthState(state: string) {
  const secret = String(process.env.GOOGLE_OAUTH_STATE_SECRET ?? "").trim();
  if (!secret) throw new Error("Missing GOOGLE_OAUTH_STATE_SECRET");
  const parts = String(state ?? "").split(".");
  if (parts.length !== 2) throw new Error("Invalid state");
  const [encoded, sig] = parts;
  const expected = hmacSha256Base64Url(secret, encoded);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("Invalid state");

  const raw = base64UrlDecodeToString(encoded);
  const payload = JSON.parse(raw) as OAuthStatePayload;
  if (!payload?.pid || typeof payload.iat !== "number") throw new Error("Invalid state");
  const ageMs = Date.now() - payload.iat;
  if (ageMs < 0 || ageMs > 10 * 60 * 1000) throw new Error("State expired");
  return payload;
}

