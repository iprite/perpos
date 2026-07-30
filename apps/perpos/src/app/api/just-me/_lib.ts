import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember, ModuleAuth } from "../_lib/module-auth";
import { createAdminClient } from "../_lib/supabase";
import { setAuditContext } from "../_lib/audit";

export const MODULE_KEY = "just_me";
export type JustMeRole = "owner" | "manager" | "viewer";

export interface JustMeAuth extends Omit<ModuleAuth, "moduleRole"> {
  role: JustMeRole;
}

export async function requireJustMeMember(
  req: NextRequest,
  orgId: string,
): Promise<JustMeAuth | { ok: false; res: NextResponse }> {
  const result = await requireModuleMember(req, orgId, MODULE_KEY);
  if (!result.ok) return result;
  return { ...result, role: result.moduleRole as JustMeRole };
}

export function canWrite(role: JustMeRole): boolean {
  return ["owner", "manager"].includes(role);
}

/* ───────────────────────────────────────────────────────────────────────────
 * ระบบบริหารโครงการ (just-me-project-loop) — ของใช้ร่วมของทุก route
 * contract: .claude/feature-factory/specs/just-me-project-loop.md §6
 *
 * กติกาที่ทุก route ต้องทำตาม:
 *   1. `guard(req, {...})` — orgId + membership (+ สิทธิ์เขียน/สิทธิ์เห็นต้นทุน)
 *   2. mutation ต้องเรียก `auditMutation()` ก่อนเขียนเสมอ
 *   3. ข้อมูลที่ตอบกลับต้องผ่าน `stripCost*()` — viewer ห้ามได้รับคอลัมน์ต้นทุน/กำไรเลย
 *   4. id ที่รับมาจาก body ต้องผ่าน `assertOrgRefs()` ก่อน insert/update (กันอ้างข้าม org)
 * ─────────────────────────────────────────────────────────────────────────── */

/** owner/manager เท่านั้นที่เห็นต้นทุน/กำไร (ตรงกับ `just_me_has_cost_access()` ที่ DB) */
export function canSeeCost(role: JustMeRole): boolean {
  return role !== "viewer";
}

export function jmError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function orgIdFromRequest(req: NextRequest): string | null {
  return req.nextUrl.searchParams.get("orgId");
}

export type JustMeGuardResult =
  | { ok: true; auth: JustMeAuth; orgId: string }
  | { ok: false; res: NextResponse };

/**
 * ด่านมาตรฐาน — `write` = ต้องแก้ข้อมูลได้ · `cost` = ต้องเห็นต้นทุนได้ · `owner` = เจ้าของเท่านั้น
 * (RLS ที่ DB เป็นด่านที่สอง ไม่ใช่ด่านเดียว — route ใช้ service-role client จึงต้องกันเองที่นี่)
 */
export async function guard(
  req: NextRequest,
  opts?: { write?: boolean; cost?: boolean; owner?: boolean },
): Promise<JustMeGuardResult> {
  const orgId = orgIdFromRequest(req);
  if (!orgId) return { ok: false, res: jmError("ไม่ได้ระบุองค์กร (orgId)", 400) };

  const auth = await requireJustMeMember(req, orgId);
  if (!auth.ok) return { ok: false, res: auth.res };

  if (opts?.owner && auth.role !== "owner") {
    return { ok: false, res: jmError("เฉพาะเจ้าของโมดูลเท่านั้นที่ทำรายการนี้ได้", 403) };
  }
  if (opts?.cost && !canSeeCost(auth.role)) {
    return { ok: false, res: jmError("ไม่มีสิทธิ์เข้าถึงข้อมูลต้นทุน/กำไร", 403) };
  }
  if (opts?.write && !canWrite(auth.role)) {
    return { ok: false, res: jmError("ไม่มีสิทธิ์แก้ไขข้อมูลในโมดูลนี้", 403) };
  }
  return { ok: true, auth, orgId };
}

/** เรียกก่อนทุก mutation (best-effort — ไม่ throw) */
export async function auditMutation(req: NextRequest, auth: JustMeAuth): Promise<void> {
  await setAuditContext(req, auth.userId, auth.orgId);
}

/**
 * คอลัมน์ที่ถือเป็น "ต้นทุน/กำไร" — viewer ต้องไม่ได้รับกลับไปเลยแม้แต่คีย์เดียว
 * ⛔ เพิ่มคอลัมน์ต้นทุนใหม่ที่ไหนก็ตาม ต้องมาเติมที่นี่ (ที่เดียวของทั้งโมดูล)
 */
export const COST_FIELDS = [
  "material_unit_cost",
  "labor_unit_cost",
  "overhead_unit_cost",
  "material_unit_cost_manual",
  "material_cost_mode",
  "effective_material_cost",
  "unit_cost",
  "unit_cost_total",
  "cost_amount",
  "total_cost",
  "budget_cost",
  "budget_revised_at",
  "margin_pct",
  "margin_source",
  "default_margin_pct",
  "estimated_unit_cost",
  "selected_unit_cost",
  "total_estimated_cost",
  "total_selected_cost",
  "baseline_material_cost",
  "baseline_at",
  "cost_alert_pct",
  "cost_drift_pct",
  "cost_alert",
  "avg_cost",
  "actual_cost",
  "actual_counted",
  "committed_cost",
  "forecast_cost",
  "forecast_profit",
  "forecast_margin_pct",
  "actual_profit",
  "cost_variance",
  "over_budget",
] as const;

const COST_FIELD_SET: ReadonlySet<string> = new Set<string>(COST_FIELDS);

/** ตัดคอลัมน์ต้นทุนออกจาก object เดียว (owner/manager ได้ของเดิมทั้งก้อน) */
export function stripCost<T extends Record<string, unknown>>(
  row: T,
  role: JustMeRole,
): Record<string, unknown> {
  if (canSeeCost(role)) return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!COST_FIELD_SET.has(k)) out[k] = v;
  }
  return out;
}

/** ตัดคอลัมน์ต้นทุนออกจากทั้ง list */
export function stripCostList<T extends Record<string, unknown>>(
  rows: T[],
  role: JustMeRole,
): Record<string, unknown>[] {
  if (canSeeCost(role)) return rows;
  return rows.map((r) => stripCost(r, role));
}

/** เก็บเฉพาะฟิลด์ที่อนุญาต (กัน mass-assignment เช่น org_id/created_by หลุดเข้ามาจาก body) */
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

export interface OrgRef {
  /** ค่าที่รับมาจาก body (null/undefined/'' = ไม่ได้ส่งมา → ข้าม) */
  value: unknown;
  table: string;
  label: string;
}

/**
 * พิสูจน์ว่า id ที่ body อ้างถึงเป็นของ org นี้จริง — **ด่านเดียวที่กันการอ้างข้ามองค์กร**
 * (FK หลายตัวเป็นคอลัมน์เดียวโดยตั้งใจ เพื่อให้ `ON DELETE SET NULL` ได้ ⇒ DB ไม่ได้ผูก org ให้)
 * คืนข้อความไทยเมื่อไม่ผ่าน · null = ผ่านหมด
 */
export async function assertOrgRefs(orgId: string, refs: OrgRef[]): Promise<string | null> {
  const admin = createAdminClient();
  for (const ref of refs) {
    if (ref.value === null || ref.value === undefined || ref.value === "") continue;
    const { count, error } = await admin
      .from(ref.table)
      .select("id", { count: "exact", head: true })
      .eq("id", ref.value as string)
      .eq("org_id", orgId);
    if (error) return `ตรวจสอบ${ref.label}ไม่สำเร็จ`;
    if (!count) return `ไม่พบ${ref.label}ที่เลือกในองค์กรนี้`;
  }
  return null;
}

/**
 * ตรวจ+แปลงตัวเลขของโครงการในที่เดียว (สร้างและแก้ไขใช้ตัวเดียวกัน)
 * แก้ค่าใน `payload` ให้เป็น number/null แล้วคืนข้อความไทยถ้าไม่ผ่าน
 */
export function validateProjectNumbers(payload: Record<string, unknown>): string | null {
  for (const key of ["latitude", "longitude", "contract_amount", "margin_pct", "retention_pct"]) {
    if (!(key in payload)) continue;
    const v = numOrNull(payload[key]);
    if (v === undefined) return "ค่าตัวเลขที่กรอกไม่ถูกต้อง";
    payload[key] = v;
  }
  const lat = payload.latitude as number | null | undefined;
  const lng = payload.longitude as number | null | undefined;
  if (typeof lat === "number" && (lat < -90 || lat > 90))
    return "ละติจูดต้องอยู่ระหว่าง -90 ถึง 90";
  if (typeof lng === "number" && (lng < -180 || lng > 180)) {
    return "ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180";
  }
  const contract = payload.contract_amount as number | null | undefined;
  if (typeof contract === "number" && contract < 0) return "มูลค่าสัญญาติดลบไม่ได้";
  const retention = payload.retention_pct as number | null | undefined;
  if (typeof retention === "number" && (retention < 0 || retention > 100)) {
    return "เงินประกันผลงานต้องอยู่ระหว่าง 0–100%";
  }
  return null;
}

/** ผู้ใช้ที่ถูกอ้างถึง (ผู้จัดการโครงการ/ผู้เบิก) ต้องเป็นสมาชิกขององค์กรนี้จริง */
export async function assertOrgMember(
  orgId: string,
  userId: unknown,
  label = "ผู้ใช้",
): Promise<string | null> {
  if (userId === null || userId === undefined || userId === "") return null;
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("user_id", userId as string);
  if (error) return `ตรวจสอบ${label}ไม่สำเร็จ`;
  if (!count) return `${label}ที่เลือกไม่ใช่สมาชิกขององค์กรนี้`;
  return null;
}

/** ปี พ.ศ. ปัจจุบัน (ใช้เป็นส่วนหนึ่งของเลขที่เอกสารภายใน) */
export function buddhistYear(d = new Date()): number {
  return d.getFullYear() + 543;
}

/**
 * เลขรันภายในของโมดูล (`JM-2569-001` / `PR-2569-001`)
 * — ไม่ใช้ RPC ใหม่: หาเลขถัดไปจากค่าที่มีอยู่แล้วยิง insert ผ่าน `attempt()`
 *   ถ้าชนกับ unique index (23505) แปลว่ามีคนแทรกพร้อมกัน → ลองใหม่ด้วยเลขถัดไป
 *   ⇒ ไม่มีทางได้เลขซ้ำ (ด่านจริงคือ unique index ไม่ใช่การนับ)
 */
export async function insertWithGeneratedCode<T>(
  args: {
    orgId: string;
    table: string;
    column: string;
    prefix: string;
    attempts?: number;
  },
  attempt: (
    code: string,
  ) => Promise<{ data: T | null; error: { code?: string; message: string } | null }>,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const admin = createAdminClient();
  const head = `${args.prefix}-${buddhistYear()}-`;
  const max = args.attempts ?? 8;

  const { data: latest } = await admin
    .from(args.table)
    .select(args.column)
    .eq("org_id", args.orgId)
    .like(args.column, `${head}%`)
    .order(args.column, { ascending: false })
    .limit(1);

  const lastCode = (latest?.[0] as Record<string, string> | undefined)?.[args.column] ?? "";
  let seq = Number(lastCode.slice(head.length)) || 0;

  for (let i = 0; i < max; i++) {
    seq += 1;
    const code = `${head}${String(seq).padStart(3, "0")}`;
    const { data, error } = await attempt(code);
    if (!error && data) return { ok: true, data };
    if (error?.code !== "23505") {
      return { ok: false, error: error?.message ?? "บันทึกไม่สำเร็จ", status: 500 };
    }
  }
  return { ok: false, error: "ออกเลขที่เอกสารไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", status: 409 };
}

/** อ่านค่าตัวเลขจาก body แบบเข้มงวด — คืน undefined ถ้าไม่ได้ส่งมา, null ถ้าตั้งใจล้างค่า */
export function numOrNull(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// ─── Token Sign/Verify for Passwordless Clock In/Out ─────────────────────────
import crypto from "crypto";

const SIGNING_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || "just-me-clock-secret-key";

// 'depart' = leaving current location (records origin GPS)
// 'arrive' = arriving at destination (records destination GPS, calculates hop)
export type ClockTokenType = "depart" | "arrive";
export type LocationType = "home" | "site";

export interface ClockTokenPayload {
  profileId: string;
  orgId: string;
  type: ClockTokenType;
  locationType: LocationType | null;
  note: string | null;
}

export function signClockToken(
  profileId: string,
  orgId: string,
  type: ClockTokenType,
  locationType?: LocationType,
  note?: string,
): string {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const payload = JSON.stringify({
    profileId,
    orgId,
    type,
    locationType: locationType ?? null,
    note: note ?? null,
    exp: expiresAt,
  });
  const base64Payload = Buffer.from(payload).toString("base64url");
  const signature = crypto.createHmac("sha256", SIGNING_SECRET).update(payload).digest("hex");
  return `${base64Payload}.${signature}`;
}

export function verifyClockToken(token: string): ClockTokenPayload | null {
  try {
    const [base64Payload, signature] = token.split(".");
    if (!base64Payload || !signature) return null;
    const payloadStr = Buffer.from(base64Payload, "base64url").toString("utf8");
    const expectedSignature = crypto
      .createHmac("sha256", SIGNING_SECRET)
      .update(payloadStr)
      .digest("hex");
    if (signature !== expectedSignature) return null;

    const p = JSON.parse(payloadStr) as ClockTokenPayload & { exp: number };
    if (Date.now() > p.exp) return null;

    return {
      profileId: p.profileId,
      orgId: p.orgId,
      type: p.type,
      locationType: p.locationType ?? null,
      note: p.note ?? null,
    };
  } catch {
    return null;
  }
}
