/**
 * GET /dev-login?returnTo=...  — DEV-ONLY auto-login as super_admin
 *
 * เปิดให้ "preview localhost ในฐานะ superadmin โดยไม่ต้อง login เอง"
 *   - มินต์ Supabase session จริง (magic-link → verifyOtp → ตั้ง cookie) ให้บัญชี super_admin
 *     → ทั้ง server (RLS), client (useAuth), guard ทุกตัวทำงานเหมือน login ปกติ
 *   - middleware เป็นคนพาผู้ใช้มาที่นี่อัตโนมัติเมื่อยังไม่มี session (ดู src/middleware.ts)
 *
 * ⚠️ ปิดสนิทบน production:
 *   - ต้อง NODE_ENV !== 'production'  (Vercel = production → ปิดเสมอ)
 *   - และต้องตั้ง env `DEV_AUTOLOGIN=1` อย่างชัดเจน
 *   ถ้าไม่ครบทั้งสอง → 404 (เหมือนไม่มี route นี้)
 *
 * เลือกบัญชี: env `DEV_LOGIN_EMAIL` ถ้าตั้งไว้ · ไม่งั้นหยิบ super_admin คนแรกจาก DB อัตโนมัติ
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withBasePath } from "@/utils/base-path";

export function devAutoLoginEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTOLOGIN === "1";
}

export async function GET(request: NextRequest) {
  // ด่านความปลอดภัย — ปิดสนิทถ้าไม่ใช่ dev หรือไม่ได้เปิด flag
  if (!devAutoLoginEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !anonKey) {
    return new NextResponse("Missing Supabase env", { status: 500 });
  }

  const reqUrl = new URL(request.url);
  const rt = reqUrl.searchParams.get("returnTo");
  const returnTo = rt && rt.startsWith("/") && !rt.startsWith("//") ? rt : "/admin";

  const admin: SupabaseClient = createSupabaseAdminClient();

  // เลือกบัญชี super_admin: env ก่อน → ไม่งั้น super_admin คนแรก
  let email: string | null = null;
  const wanted = process.env.DEV_LOGIN_EMAIL?.trim();
  if (wanted) {
    const { data } = await admin
      .from("profiles")
      .select("email, role, is_active")
      .eq("email", wanted)
      .maybeSingle();
    const p = data as { email?: string; role?: string; is_active?: boolean } | null;
    if (!p) return new NextResponse(`DEV_LOGIN_EMAIL not found: ${wanted}`, { status: 400 });
    if (p.role !== "super_admin") {
      return new NextResponse(`DEV_LOGIN_EMAIL is not super_admin: ${wanted}`, { status: 400 });
    }
    email = p.email ?? null;
  } else {
    const { data } = await admin
      .from("profiles")
      .select("email")
      .eq("role", "super_admin")
      .eq("is_active", true)
      .not("email", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    email = (data as { email?: string } | null)?.email ?? null;
  }
  if (!email) {
    return new NextResponse(
      "No super_admin account found. Set DEV_LOGIN_EMAIL in apps/perpos/.env.local",
      { status: 400 },
    );
  }

  // magic-link → token_hash → verifyOtp → ตั้ง session cookies (ท่าเดียวกับ LINE callback)
  const { data: gl, error: ge } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = gl?.properties?.hashed_token;
  if (ge || !tokenHash) {
    return new NextResponse(`Failed to mint session: ${ge?.message ?? "no token"}`, {
      status: 500,
    });
  }

  const dest = new URL(withBasePath(returnTo), request.url);
  const response = NextResponse.redirect(dest);

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) response.cookies.set(c.name, c.value, c.options);
      },
    },
  });
  const { error: ve } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (ve) return new NextResponse(`verifyOtp failed: ${ve.message}`, { status: 500 });

  return response;
}
