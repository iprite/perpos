/**
 * boq.ts — fetch layer ของ BOQ (ใช้ร่วม: SSR page + API route)
 * contract: .claude/feature-factory/specs/just-me-project-loop.md §4.3 / §6
 *
 * กติกา:
 *  - ทุกฟังก์ชัน **รับ supabase client เข้ามา** ไม่สร้างเอง (page ส่ง RLS client · route ส่ง service-role)
 *  - `basic: true` = อ่านผ่าน view ที่ไม่มีคอลัมน์ต้นทุน (ทางของ viewer เมื่อใช้ RLS client)
 *  - **ห้ามคำนวณเงินในไฟล์นี้** — สูตรทั้งหมดอยู่ `project-metrics.ts`
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { boqLineTotals, boqTotals, effectiveMaterialCost, resolveMargin } from "./project-metrics";
import { getSettings, listWorkCategories, loadAvgCosts } from "./price-book";
import type { JustMeBoq, JustMeBoqItem, JustMePriceBookRow, MarginSource } from "./types";

export interface BoqReadOpts {
  /** true = viewer path (อ่าน view ที่ไม่มีต้นทุน) */
  basic?: boolean;
}

export async function listBoqs(
  db: SupabaseClient,
  orgId: string,
  projectId: string,
  opts?: BoqReadOpts,
): Promise<JustMeBoq[]> {
  const source = opts?.basic ? "just_me_boqs_basic" : "just_me_boqs";
  const { data, error } = await db
    .from(source)
    .select("*")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .order("revision_no", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMeBoq[];
}

export async function getBoq(
  db: SupabaseClient,
  orgId: string,
  boqId: string,
  opts?: BoqReadOpts,
): Promise<JustMeBoq | null> {
  const source = opts?.basic ? "just_me_boqs_basic" : "just_me_boqs";
  const { data, error } = await db
    .from(source)
    .select("*")
    .eq("org_id", orgId)
    .eq("id", boqId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as JustMeBoq | null;
}

/** BOQ ฉบับที่อนุมัติแล้วของโครงการ (มีได้ไม่เกิน 1 — partial unique index) */
export async function getApprovedBoq(
  db: SupabaseClient,
  orgId: string,
  projectId: string,
  opts?: BoqReadOpts,
): Promise<JustMeBoq | null> {
  const source = opts?.basic ? "just_me_boqs_basic" : "just_me_boqs";
  const { data, error } = await db
    .from(source)
    .select("*")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .eq("status", "approved")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as JustMeBoq | null;
}

export async function listBoqItems(
  db: SupabaseClient,
  orgId: string,
  boqId: string,
  opts?: BoqReadOpts,
): Promise<JustMeBoqItem[]> {
  // view ของ viewer ไม่มี `created_at` → เรียงได้แค่ sort_order (ห้าม order คอลัมน์ที่ไม่มีใน view)
  const basic = opts?.basic === true;
  let q = db
    .from(basic ? "just_me_boq_items_sell" : "just_me_boq_items")
    .select("*")
    .eq("org_id", orgId)
    .eq("boq_id", boqId)
    .order("sort_order", { ascending: true });
  if (!basic) q = q.order("created_at", { ascending: true });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMeBoqItem[];
}

/** บรรทัดของ BOQ ที่อนุมัติแล้ว — ฐานของ %คืบหน้า/งบ (คืน [] ถ้ายังไม่อนุมัติ) */
export async function listApprovedBoqItems(
  db: SupabaseClient,
  orgId: string,
  projectId: string,
  opts?: BoqReadOpts,
): Promise<JustMeBoqItem[]> {
  const boq = await getApprovedBoq(db, orgId, projectId, opts);
  if (!boq) return [];
  return listBoqItems(db, orgId, boq.id, opts);
}

// ─── อนุมัติ BOQ (freeze + เขียน baseline ของโครงการ) ────────────────────────

export interface ApproveBoqResult {
  boq: JustMeBoq;
  budget_cost: number | null;
  contract_amount: number | null;
  counted: number;
}

/**
 * อนุมัติ BOQ — **ยอดทุกช่องคำนวณฝั่ง server จากบรรทัดจริงเท่านั้น** (ห้าม UI ส่งยอดมา)
 * ลำดับที่ห้ามสลับ:
 *   1. ฉบับที่ approved อยู่เดิม → `superseded` ก่อน (partial unique index ยอมให้มี approved ได้ใบเดียว)
 *   2. ฉบับนี้ → `approved` + freeze `total_cost`/`total_amount`
 *   3. โครงการ → `budget_cost` (baseline) + `budget_revised_at`
 *      · `contract_amount` เขียนให้เฉพาะตอนที่ยังไม่มี (ต่อรองราคาแล้วแก้มือได้ ห้ามเขียนทับ)
 */
export async function approveBoq(
  db: SupabaseClient,
  args: { orgId: string; boqId: string; userId: string },
): Promise<{ ok: true; result: ApproveBoqResult } | { ok: false; error: string; status: number }> {
  const boq = await getBoq(db, args.orgId, args.boqId);
  if (!boq) return { ok: false, error: "ไม่พบ BOQ ฉบับนี้", status: 404 };
  if (boq.status === "approved") {
    return { ok: false, error: "BOQ ฉบับนี้อนุมัติไปแล้ว", status: 409 };
  }
  if (boq.status !== "draft") {
    return { ok: false, error: "อนุมัติได้เฉพาะฉบับร่างเท่านั้น", status: 409 };
  }

  const items = await listBoqItems(db, args.orgId, args.boqId);
  if (items.length === 0) {
    return { ok: false, error: "BOQ ยังไม่มีรายการ — เพิ่มรายการก่อนอนุมัติ", status: 400 };
  }
  const totals = boqTotals(items);

  const { data: project, error: projErr } = await db
    .from("just_me_projects")
    .select("id, status, contract_amount")
    .eq("org_id", args.orgId)
    .eq("id", boq.project_id)
    .maybeSingle();
  if (projErr) return { ok: false, error: projErr.message, status: 500 };
  if (!project) return { ok: false, error: "ไม่พบโครงการของ BOQ ฉบับนี้", status: 404 };

  const { error: supErr } = await db
    .from("just_me_boqs")
    .update({ status: "superseded" })
    .eq("org_id", args.orgId)
    .eq("project_id", boq.project_id)
    .eq("status", "approved");
  if (supErr) return { ok: false, error: supErr.message, status: 500 };

  const { data: approved, error: apprErr } = await db
    .from("just_me_boqs")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: args.userId,
      total_cost: totals.total_cost,
      total_amount: totals.total_amount,
    })
    .eq("org_id", args.orgId)
    .eq("id", args.boqId)
    .eq("status", "draft")
    .select("*")
    .maybeSingle();
  if (apprErr) return { ok: false, error: apprErr.message, status: 500 };
  if (!approved) return { ok: false, error: "สถานะ BOQ เปลี่ยนไปแล้ว กรุณาโหลดใหม่", status: 409 };

  const current = project as { status: string; contract_amount: number | null };
  const projectPatch: Record<string, unknown> = {
    budget_cost: totals.total_cost,
    budget_revised_at: new Date().toISOString(),
  };
  if (current.contract_amount === null) projectPatch.contract_amount = totals.total_amount;
  if (current.status === "survey") projectPatch.status = "boq";

  const { error: updErr } = await db
    .from("just_me_projects")
    .update(projectPatch)
    .eq("org_id", args.orgId)
    .eq("id", boq.project_id);
  if (updErr) return { ok: false, error: updErr.message, status: 500 };

  return {
    ok: true,
    result: {
      boq: approved as JustMeBoq,
      budget_cost: totals.total_cost,
      contract_amount: current.contract_amount ?? totals.total_amount,
      counted: totals.counted,
    },
  };
}

// ─── ประกอบบรรทัด BOQ (ใช้ทั้งตอนสร้างและตอนแก้) ────────────────────────────

export interface MarginContext {
  /** margin ของ price book ที่บรรทัดนี้อ้างถึง */
  priceBook: number | null;
  /** margin ของหมวดงาน */
  category: number | null;
  /** override ระดับโครงการ */
  project: number | null;
  /** ค่าเริ่มต้นบริษัท */
  company: number | null;
}

export interface BoqItemInput {
  category_id?: string | null;
  price_book_id?: string | null;
  item_id?: string | null;
  item_kind?: string;
  name: string;
  unit: string;
  qty: number;
  material_unit_cost?: number | null;
  labor_unit_cost?: number | null;
  overhead_unit_cost?: number | null;
  /** ตั้งมือบนบรรทัด — null/undefined = ให้ resolve ตามลำดับชั้น */
  margin_pct?: number | null;
  sort_order?: number | null;
}

const ITEM_KINDS = new Set(["material", "labor", "subcontract", "other"]);

/**
 * แปลง input ของบรรทัด BOQ → แถวที่พร้อมเขียน DB
 * - ต้นทุน 3 ก้อนเป็น **snapshot** (ไม่ join สดกับ price book ตอนอ่านทีหลัง)
 * - margin resolve 4 ชั้นที่นี่ที่เดียว แล้วบันทึก `margin_source` เพื่อให้ UI บอกที่มาได้
 * - ยอดเงินทุกช่องคำนวณจาก `project-metrics.boqLineTotals()` เท่านั้น (**ห้าม UI ส่งยอดมา**)
 */
export function buildBoqItemRow(
  input: BoqItemInput,
  margins: MarginContext,
): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const unit = typeof input.unit === "string" ? input.unit.trim() : "";
  const qty = Number(input.qty);

  if (!name) return { ok: false, error: "กรุณาระบุชื่อรายการ" };
  if (!unit) return { ok: false, error: `รายการ "${name}" ยังไม่ได้ระบุหน่วยนับ` };
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: `ปริมาณของรายการ "${name}" ต้องมากกว่า 0` };
  }

  const kind = input.item_kind && ITEM_KINDS.has(input.item_kind) ? input.item_kind : "material";
  const parts = {
    material: toCost(input.material_unit_cost),
    labor: toCost(input.labor_unit_cost),
    overhead: toCost(input.overhead_unit_cost),
  };
  if (parts.material < 0 || parts.labor < 0 || parts.overhead < 0) {
    return { ok: false, error: `ต้นทุนของรายการ "${name}" ติดลบไม่ได้` };
  }

  const manual = typeof input.margin_pct === "number" && Number.isFinite(input.margin_pct);
  const resolved = resolveMargin({
    item: manual ? input.margin_pct : null,
    priceBook: margins.priceBook,
    category: margins.category,
    project: margins.project,
    company: margins.company,
  });
  const totals = boqLineTotals(qty, parts, resolved.pct);

  return {
    ok: true,
    row: {
      category_id: input.category_id ?? null,
      price_book_id: input.price_book_id ?? null,
      item_id: input.item_id ?? null,
      item_kind: kind,
      name,
      unit,
      qty,
      material_unit_cost: parts.material,
      labor_unit_cost: parts.labor,
      overhead_unit_cost: parts.overhead,
      margin_pct: resolved.pct,
      margin_source: resolved.source satisfies MarginSource,
      unit_price: totals.unit_price,
      amount: totals.amount,
      cost_amount: totals.cost_amount,
      sort_order: Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0,
    },
  };
}

/**
 * เตรียมบรรทัด BOQ หลายรายการให้พร้อมเขียน — จุดเดียวที่ resolve ต้นทุน/margin
 * - บรรทัดที่อ้าง `price_book_id` และไม่ได้ส่งต้นทุนมาเอง → ดึงจาก price book
 *   (โหมด auto ใช้ `avg_cost` จากคลัง ณ ตอนถอด BOQ แล้ว **snapshot** ลงบรรทัด)
 * - ตรวจ org ของทุก id ที่อ้างถึงให้เรียบร้อยก่อนคืนแถว (กันอ้างข้ามองค์กร)
 */
export async function prepareBoqItemRows(
  db: SupabaseClient,
  args: { orgId: string; projectId: string; inputs: BoqItemInput[] },
): Promise<{ ok: true; rows: Record<string, unknown>[] } | { ok: false; error: string }> {
  if (args.inputs.length === 0) return { ok: false, error: "ไม่มีรายการที่จะบันทึก" };

  const [{ data: project }, settings, categories] = await Promise.all([
    db
      .from("just_me_projects")
      .select("id, margin_pct")
      .eq("org_id", args.orgId)
      .eq("id", args.projectId)
      .maybeSingle(),
    getSettings(db, args.orgId),
    listWorkCategories(db, args.orgId, { includeInactive: true }),
  ]);
  if (!project) return { ok: false, error: "ไม่พบโครงการของ BOQ ฉบับนี้" };
  const projectMargin = (project as { margin_pct: number | null }).margin_pct;
  const categoryMargin = new Map(categories.map((c) => [c.id, c.default_margin_pct]));

  // price book ที่บรรทัดอ้างถึง (ตรวจ org ไปในตัว — id ที่ไม่ใช่ของ org นี้จะไม่อยู่ใน map)
  const priceBookIds = Array.from(
    new Set(args.inputs.map((i) => i.price_book_id).filter((v): v is string => !!v)),
  );
  const priceBooks = new Map<string, JustMePriceBookRow>();
  if (priceBookIds.length > 0) {
    const { data, error } = await db
      .from("just_me_price_book")
      .select("*")
      .eq("org_id", args.orgId)
      .in("id", priceBookIds);
    if (error) return { ok: false, error: error.message };
    for (const row of (data ?? []) as JustMePriceBookRow[]) priceBooks.set(row.id, row);
    const missing = priceBookIds.filter((id) => !priceBooks.has(id));
    if (missing.length > 0) return { ok: false, error: "มีรายการราคามาตรฐานที่ไม่อยู่ในองค์กรนี้" };
  }
  const avgCosts = await loadAvgCosts(
    db,
    args.orgId,
    Array.from(priceBooks.values()).map((p) => p.item_id),
  );

  const rows: Record<string, unknown>[] = [];
  for (const input of args.inputs) {
    const pb = input.price_book_id ? priceBooks.get(input.price_book_id) : undefined;
    const filled: BoqItemInput = { ...input };

    if (pb) {
      if (filled.material_unit_cost === undefined || filled.material_unit_cost === null) {
        const mat = effectiveMaterialCost({
          material_cost_mode: pb.material_cost_mode,
          material_unit_cost_manual: pb.material_unit_cost_manual,
          avg_cost: pb.item_id ? (avgCosts.get(pb.item_id) ?? null) : null,
        });
        if (mat === null) {
          return {
            ok: false,
            error: `ยังไม่รู้ต้นทุนวัสดุของ "${pb.name}" (ยังไม่เคยซื้อเข้าคลัง) — กรอกต้นทุนเองหรือเปลี่ยนเป็นโหมดกำหนดเอง`,
          };
        }
        filled.material_unit_cost = mat;
      }
      if (filled.labor_unit_cost === undefined || filled.labor_unit_cost === null) {
        filled.labor_unit_cost = pb.labor_unit_cost;
      }
      if (filled.overhead_unit_cost === undefined || filled.overhead_unit_cost === null) {
        filled.overhead_unit_cost = pb.overhead_unit_cost;
      }
      if (!filled.category_id) filled.category_id = pb.category_id;
      if (!filled.item_id) filled.item_id = pb.item_id;
      if (!filled.unit) filled.unit = pb.unit;
      if (!filled.name) filled.name = pb.name;
    }

    const built = buildBoqItemRow(filled, {
      priceBook: pb?.margin_pct ?? null,
      category: filled.category_id ? (categoryMargin.get(filled.category_id) ?? null) : null,
      project: projectMargin,
      company: settings.default_margin_pct,
    });
    if (!built.ok) return { ok: false, error: built.error };
    rows.push(built.row);
  }
  return { ok: true, rows };
}

function toCost(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
