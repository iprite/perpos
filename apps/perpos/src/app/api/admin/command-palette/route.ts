/**
 * GET /api/admin/command-palette — ข้อมูลเบาสำหรับ Command Palette (⌘K) ของ super admin
 * คืน orgs + users (เฉพาะ field ที่ใช้ค้น/แสดง) — fuzzy match ทำฝั่ง client ด้วย cmdk
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../_lib/auth";
import { createAdminClient } from "../../_lib/supabase";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const [orgsRes, usersRes] = await Promise.all([
    admin.from("organizations").select("id, name").order("name"),
    admin
      .from("profiles")
      .select("id, display_name, email")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const orgs = (orgsRes.data ?? []).map((o: Record<string, unknown>) => ({
    id: String(o.id),
    name: String(o.name ?? ""),
  }));
  const users = (usersRes.data ?? []).map((u: Record<string, unknown>) => ({
    id: String(u.id),
    name: String(u.display_name ?? u.email ?? ""),
    email: (u.email as string) ?? null,
  }));

  return NextResponse.json({ orgs, users });
}
