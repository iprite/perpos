import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/supabase/types";

export function getBearerTokenFromRequest(req: Request) {
  const raw = req.headers.get("authorization") ?? "";
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function createSupabaseAuthedClient(accessToken: string) {
  const url = String(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = String(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? ""
  ).trim();
  if (!url || !anonKey) throw new Error("Missing Supabase env");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function assertActiveUser(req: Request) {
  const token = getBearerTokenFromRequest(req);
  if (!token) return { ok: false as const, status: 401, error: "unauthorized" };

  const rls = createSupabaseAuthedClient(token);
  const { data, error } = await rls.auth.getUser();
  if (error || !data.user) return { ok: false as const, status: 401, error: "unauthorized" };

  const uid = data.user.id;
  const admin = createSupabaseAdminClient();
  const { data: p, error: pe } = await admin.from("profiles").select("id,role,is_active").eq("id", uid).maybeSingle();
  if (pe || !p) return { ok: false as const, status: 403, error: "profile_not_found" };
  if (p.is_active === false) return { ok: false as const, status: 403, error: "blocked" };

  return { ok: true as const, profileId: uid, role: (p.role as Role) ?? null };
}

