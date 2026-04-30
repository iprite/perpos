import { createClient } from "@supabase/supabase-js";

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) throw new Error("Missing Supabase URL");
  return url;
}

function getSupabaseAnonKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Missing Supabase anon key");
  return key;
}

export function getBearerTokenFromRequest(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export function createSupabaseAuthedClient(accessToken: string) {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function assertCallerIsAdmin(req: Request) {
  const token = getBearerTokenFromRequest(req);
  if (!token) {
    return { ok: false as const, status: 401 as const, message: "unauthorized" };
  }

  const supabase = createSupabaseAuthedClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false as const, status: 401 as const, message: "unauthorized" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false as const, status: 403 as const, message: "forbidden" };
  }
  if (profile.role !== "admin") {
    return { ok: false as const, status: 403 as const, message: "forbidden" };
  }

  return { ok: true as const, token, userId: userData.user.id };
}

