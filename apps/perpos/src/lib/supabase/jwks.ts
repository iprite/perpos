/**
 * JWKS ของ Supabase Auth (asymmetric signing key — ES256) พร้อม cache
 *
 * ทำไมต้องมี: `auth.getClaims()` verify JWT **ในเครื่อง** ด้วย WebCrypto ได้ก็ต่อเมื่อมี JWKS อยู่ในมือ
 * ถ้าไม่ส่งให้ ตัว client จะไปดึง `/.well-known/jwks.json` เอง — แต่ทุก request เราสร้าง Supabase
 * client ใหม่ (server component / middleware) → cache ในตัว client ใช้ไม่ได้ กลายเป็นยิง network
 * ทุกครั้งอยู่ดี
 *
 * ที่นี่ cache ไว้ 2 ชั้น: module-level (ต่อ process/isolate) + fetch cache ของ Next (revalidate)
 * → ปกติ verify JWT = 0 round-trip
 *
 * คืน null เมื่อดึงไม่ได้ → caller ปล่อยให้ getClaims จัดการเอง (fallback = ถาม Auth server เหมือนเดิม)
 */

type Jwks = { keys: unknown[] };

const TTL_MS = 10 * 60 * 1000;
let cached: Jwks | null = null;
let cachedAt = 0;

export async function getSupabaseJwks(): Promise<Jwks | null> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;

  try {
    const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return cached;
    const json = (await res.json()) as Jwks;
    if (!Array.isArray(json?.keys) || !json.keys.length) return cached;
    cached = json;
    cachedAt = Date.now();
    return cached;
  } catch {
    return cached; // เน็ตสะดุด → ใช้ของเก่าไปก่อน (หมดอายุแล้วก็ยังดีกว่าไม่มี)
  }
}
