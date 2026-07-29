/**
 * _lib.ts — auth guard + CRUD factory ของโมดูลโฮลดิ้ง (p2p_group)
 * contract: .claude/module-factory/specs/p2p_group.md §8
 *
 * ทุก route:
 *   1. `requireP2pGroupMember` (module enabled + module_members + super_admin bypass)
 *   2. เขียนต้องผ่าน `canWriteP2pGroup` (viewer อ่านอย่างเดียว)
 *   3. `setAuditContext` ก่อน mutation ทุกครั้ง
 *   4. ทุก query/insert บังคับ `org_id = auth.orgId` — ห้ามรับ org_id จาก body
 */

import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember, type ModuleAuth } from "../_lib/module-auth";
import { createAdminClient } from "../_lib/supabase";
import { setAuditContext } from "../_lib/audit";
import { canSeeSensitive, canWriteP2pGroup, type P2pGroupRole } from "@/lib/p2p-group/types";

export const MODULE_KEY = "p2p_group";

export interface P2pGroupAuth extends Omit<ModuleAuth, "moduleRole"> {
  role: P2pGroupRole;
}

export type P2pGroupAuthFailure = { ok: false; res: NextResponse };

export async function requireP2pGroupMember(
  req: NextRequest,
  orgId: string,
): Promise<P2pGroupAuth | P2pGroupAuthFailure> {
  const result = await requireModuleMember(req, orgId, MODULE_KEY);
  if (!result.ok) return result;
  const { moduleRole, ...rest } = result;
  return { ...rest, role: moduleRole as P2pGroupRole };
}

export function p2pgError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** ดึง orgId จาก query string (ทุก route ใช้เหมือนกัน) */
export function orgIdFromRequest(req: NextRequest): string | null {
  return req.nextUrl.searchParams.get("orgId");
}

/**
 * ด่านมาตรฐาน: orgId + membership (+ สิทธิ์เขียนถ้าเป็น mutation)
 * คืน auth ที่พร้อมใช้ หรือ NextResponse ที่ตอบกลับได้เลย
 */
export async function guard(
  req: NextRequest,
  opts?: { write?: boolean },
): Promise<{ ok: true; auth: P2pGroupAuth } | { ok: false; res: NextResponse }> {
  const orgId = orgIdFromRequest(req);
  if (!orgId) return { ok: false, res: p2pgError("ไม่ได้ระบุองค์กร (orgId)", 400) };

  const auth = await requireP2pGroupMember(req, orgId);
  if (!auth.ok) return { ok: false, res: auth.res };

  if (opts?.write && !canWriteP2pGroup(auth.role)) {
    return { ok: false, res: p2pgError("ไม่มีสิทธิ์แก้ไขข้อมูลในโมดูลนี้", 403) };
  }
  return { ok: true, auth };
}

/** เก็บเฉพาะฟิลด์ที่อนุญาต (กัน mass-assignment เช่น org_id/org_ref_id หลุดเข้ามา) */
export function pickFields<K extends string>(
  body: Record<string, unknown>,
  allowed: readonly K[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) out[key] = body[key] === "" ? null : body[key];
  }
  return out;
}

export interface CollectionConfig {
  table: string;
  allowed: readonly string[];
  orderBy: { column: string; ascending: boolean };
  /** ฟิลด์ที่ต้องมีค่าตอนสร้าง */
  required?: readonly string[];
  /** ปรับ/ตรวจ payload ก่อนเขียน — คืน string = error ไทย */
  beforeWrite?: (
    payload: Record<string, unknown>,
    auth: P2pGroupAuth,
    mode: "create" | "update",
  ) => string | null;
  /** upsert แทน insert (ระบุคอลัมน์ที่ชนกัน) */
  upsertOn?: string;
  /** ทั้งตารางเป็นข้อมูลอ่อนไหว → viewer ไม่มีสิทธิ์อ่านเลย (contract §4) */
  sensitive?: boolean;
}

/** GET collection — filter org_id เสมอ */
export async function handleList(req: NextRequest, cfg: CollectionConfig): Promise<NextResponse> {
  const g = await guard(req);
  if (!g.ok) return g.res;

  if (cfg.sensitive && !canSeeSensitive(g.auth.role)) {
    return p2pgError("ไม่มีสิทธิ์ดูข้อมูลส่วนนี้", 403);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from(cfg.table)
    .select("*")
    .eq("org_id", g.auth.orgId)
    .order(cfg.orderBy.column, { ascending: cfg.orderBy.ascending });

  if (error) return p2pgError(error.message, 500);
  return NextResponse.json({ rows: data ?? [] });
}

/** POST collection */
export async function handleCreate(req: NextRequest, cfg: CollectionConfig): Promise<NextResponse> {
  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payload = pickFields(body, cfg.allowed);

  for (const f of cfg.required ?? []) {
    if (payload[f] == null || payload[f] === "") return p2pgError(`ข้อมูลไม่ครบ: ${f}`, 400);
  }
  const err = cfg.beforeWrite?.(payload, g.auth, "create");
  if (err) return p2pgError(err, 400);

  payload.org_id = g.auth.orgId;
  payload.created_by = g.auth.userId;

  const admin = createAdminClient();
  await setAuditContext(req, g.auth.userId, g.auth.orgId);

  const q = cfg.upsertOn
    ? admin.from(cfg.table).upsert(payload, { onConflict: cfg.upsertOn })
    : admin.from(cfg.table).insert(payload);

  const { data, error } = await q.select().single();
  if (error) return p2pgError(error.message, 500);
  return NextResponse.json({ row: data }, { status: 201 });
}

/** PATCH item */
export async function handleUpdate(
  req: NextRequest,
  id: string,
  cfg: CollectionConfig,
): Promise<NextResponse> {
  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payload = pickFields(body, cfg.allowed);
  if (Object.keys(payload).length === 0) return p2pgError("ไม่มีข้อมูลที่จะแก้ไข", 400);

  const err = cfg.beforeWrite?.(payload, g.auth, "update");
  if (err) return p2pgError(err, 400);

  const admin = createAdminClient();
  await setAuditContext(req, g.auth.userId, g.auth.orgId);

  const { data, error } = await admin
    .from(cfg.table)
    .update(payload)
    .eq("id", id)
    .eq("org_id", g.auth.orgId) // กัน IDOR ข้าม org
    .select()
    .maybeSingle();

  if (error) return p2pgError(error.message, 500);
  if (!data) return p2pgError("ไม่พบรายการนี้", 404);
  return NextResponse.json({ row: data });
}

/** DELETE item */
export async function handleDelete(
  req: NextRequest,
  id: string,
  cfg: Pick<CollectionConfig, "table">,
): Promise<NextResponse> {
  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  await setAuditContext(req, g.auth.userId, g.auth.orgId);

  const { error } = await admin
    .from(cfg.table)
    .delete()
    .eq("id", id)
    .eq("org_id", g.auth.orgId);

  if (error) return p2pgError(error.message, 500);
  return NextResponse.json({ ok: true });
}
