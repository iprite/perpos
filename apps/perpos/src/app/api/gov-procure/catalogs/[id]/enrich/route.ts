// GET    /api/gov-procure/catalogs/[id]/enrich?orgId= → สถานะรอบ enrich (member) + self-heal (C-4)
// POST   …                                            → สร้างรอบใหม่ + เข้าคิวรายการ (canWrite)
// DELETE …                                            → ยกเลิกรอบที่ทำอยู่ (canWrite)
//
// contract: §5.9 A-8 (เพดาน 3 ข้อ) · C-3 (คัด item ที่จะ enrich) · C-4 (self-heal) · C-5 (progress = aggregate)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { setAuditContext } from "../../../../_lib/audit";
import { requireGovProcureMember, canWrite, orgIdFromQuery, govError } from "../../../_lib";
import { selfHealStuckCatalogJob } from "../../../_catalog-lib";
import { getCatalog, getLatestCatalogJob } from "@/lib/gov-procure/catalog";
import {
  MAX_ITEMS_PER_JOB,
  MAX_ACTIVE_JOBS_PER_ORG,
  DAILY_TOKEN_BUDGET,
  CHUNK_SIZE,
  estimateJobCost,
} from "@/lib/gov-procure/catalog-cost";

type Ctx = { params: Promise<{ id: string }> };

/** C-3 — enrich เฉพาะของที่ AI ยังไม่ได้ทำ/ทำแล้วล้ม · ห้ามแตะ human_verified / library */
const ENRICHABLE_SOURCES = ["manual", "ai_draft"];
const ENRICHABLE_STATES = ["idle", "failed"];

/** นับรายการตาม enrich_state (แผง progress หลัง refresh — C-5) */
async function countStates(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  catalogId: string,
): Promise<Record<string, number>> {
  const { data, error } = await admin
    .from("gov_procure_catalog_items")
    .select("enrich_state")
    .eq("org_id", orgId)
    .eq("catalog_id", catalogId);

  if (error) throw new Error(error.message);
  const out: Record<string, number> = { idle: 0, queued: 0, running: 0, done: 0, failed: 0 };
  for (const r of (data ?? []) as { enrich_state: string }[]) {
    out[r.enrich_state] = (out[r.enrich_state] ?? 0) + 1;
  }
  return out;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminClient();
    const catalog = await getCatalog(admin, orgId, id);
    if (!catalog) return govError("ไม่พบชุดแคตตาล็อกนี้", 404);

    // C-4 — ปิด job ที่ตายค้างก่อนตอบ (ไม่งั้นชุดค้าง 'enriching' ถาวร)
    const heal = await selfHealStuckCatalogJob(admin, orgId, id);

    const [job, states] = await Promise.all([
      getLatestCatalogJob(admin, orgId, id),
      countStates(admin, orgId, id),
    ]);

    return NextResponse.json({
      job,
      states,
      healed: heal.healed,
      catalogStatus: heal.healed ? undefined : catalog.status,
      chunkSize: CHUNK_SIZE,
    });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์สั่งให้ AI เติมข้อมูล", 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const onlyFailed = body.onlyFailed === true; // ปุ่ม "ลองใหม่เฉพาะที่ล้มเหลว"

  const admin = createAdminClient();

  try {
    const catalog = await getCatalog(admin, orgId, id);
    if (!catalog) return govError("ไม่พบชุดแคตตาล็อกนี้", 404);

    // ปิดของค้างก่อน (กดสั่งใหม่หลังปิดแท็บต้องได้เลย)
    await selfHealStuckCatalogJob(admin, orgId, id);

    // ── A-8 (2) จำนวน job ที่ยังทำงานอยู่ของทั้ง org ────────────────────────
    const { count: activeJobs, error: activeErr } = await admin
      .from("gov_procure_catalog_jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("status", ["pending", "processing"]);
    if (activeErr) return govError(activeErr.message, 500);
    if ((activeJobs ?? 0) >= MAX_ACTIVE_JOBS_PER_ORG) {
      return govError(
        `มีงาน AI ที่กำลังทำอยู่ ${activeJobs} ชุดแล้ว — รอให้เสร็จก่อนจึงสั่งชุดใหม่ได้`,
        429,
      );
    }

    // ── A-8 (3) งบ token ต่อวันต่อ org ─────────────────────────────────────
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: todayJobs, error: tokenErr } = await admin
      .from("gov_procure_catalog_jobs")
      .select("input_tokens, output_tokens")
      .eq("org_id", orgId)
      .gte("created_at", since);
    if (tokenErr) return govError(tokenErr.message, 500);

    const usedTokens = (todayJobs ?? []).reduce(
      (sum, j) => sum + Number(j.input_tokens ?? 0) + Number(j.output_tokens ?? 0),
      0,
    );
    if (usedTokens > DAILY_TOKEN_BUDGET) {
      return govError(
        "ใช้งาน AI ครบงบประจำวันขององค์กรแล้ว — ลองใหม่พรุ่งนี้ หรือติดต่อผู้ดูแลระบบ",
        429,
      );
    }

    // ── คัดรายการเข้าคิว (C-3) ─────────────────────────────────────────────
    let candidateQ = admin
      .from("gov_procure_catalog_items")
      .select("id")
      .eq("org_id", orgId)
      .eq("catalog_id", id)
      .in("source", ENRICHABLE_SOURCES)
      .order("seq_no", { ascending: true });

    candidateQ = onlyFailed
      ? candidateQ.eq("enrich_state", "failed")
      : candidateQ.in("enrich_state", ENRICHABLE_STATES);

    const { data: candidates, error: candErr } = await candidateQ;
    if (candErr) return govError(candErr.message, 500);

    const ids = (candidates ?? []).map((c) => (c as { id: string }).id);
    if (ids.length === 0) {
      return govError("ไม่มีรายการที่ต้องให้ AI เติมข้อมูล (รายการที่ยืนยันแล้วจะถูกข้ามเสมอ)");
    }

    // ── A-8 (1) เพดานรายการต่อ job ─────────────────────────────────────────
    if (ids.length > MAX_ITEMS_PER_JOB) {
      return govError(
        `สั่งได้สูงสุด ${MAX_ITEMS_PER_JOB} รายการต่อครั้ง (ชุดนี้มี ${ids.length} รายการที่ต้องเติม) — แบ่งเป็นหลายชุดก่อน`,
      );
    }

    await setAuditContext(req, auth.userId, orgId);

    const { data: job, error: jobErr } = await admin
      .from("gov_procure_catalog_jobs")
      .insert({
        org_id: orgId,
        catalog_id: id,
        status: "pending",
        total_items: ids.length,
        chunk_size: CHUNK_SIZE, // A-12 — ไม่รับจาก body
        triggered_by: auth.userId,
        heartbeat_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (jobErr) {
      // partial unique (catalog_id) where status in (pending,processing) = กดรัว
      if (jobErr.code === "23505") {
        return govError("ชุดนี้มีงาน AI ที่กำลังทำอยู่แล้ว", 409);
      }
      return govError(jobErr.message, 500);
    }

    const jobId = (job as { id: string }).id;

    const { error: queueErr } = await admin
      .from("gov_procure_catalog_items")
      .update({ enrich_state: "queued", enrich_job_id: jobId, enrich_error: null })
      .eq("org_id", orgId)
      .eq("catalog_id", id)
      .in("id", ids);

    if (queueErr) {
      await admin
        .from("gov_procure_catalog_jobs")
        .update({ status: "failed", error_message: queueErr.message })
        .eq("id", jobId)
        .eq("org_id", orgId);
      return govError(queueErr.message, 500);
    }

    await admin
      .from("gov_procure_catalogs")
      .update({ status: "enriching" })
      .eq("id", id)
      .eq("org_id", orgId);

    return NextResponse.json(
      {
        job,
        queued: ids.length,
        chunkSize: CHUNK_SIZE,
        estCost: estimateJobCost(ids.length),
      },
      { status: 201 },
    );
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์ยกเลิกงาน AI", 403);

  const admin = createAdminClient();

  try {
    const { data: jobs, error } = await admin
      .from("gov_procure_catalog_jobs")
      .select("id, done_items")
      .eq("org_id", orgId)
      .eq("catalog_id", id)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return govError(error.message, 500);
    const job = (jobs ?? [])[0] as { id: string; done_items: number } | undefined;
    if (!job) return govError("ไม่มีงาน AI ที่กำลังทำอยู่", 404);

    await setAuditContext(req, auth.userId, orgId);

    await admin
      .from("gov_procure_catalog_jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("org_id", orgId);

    // คืนคิวที่ยังไม่เริ่ม (ที่กำลังรันอยู่ปล่อยให้จบรอบตัวเอง)
    await admin
      .from("gov_procure_catalog_items")
      .update({ enrich_state: "idle", enrich_job_id: null })
      .eq("org_id", orgId)
      .eq("catalog_id", id)
      .eq("enrich_state", "queued");

    await admin
      .from("gov_procure_catalogs")
      .update({ status: job.done_items > 0 ? "review" : "draft" })
      .eq("id", id)
      .eq("org_id", orgId)
      .eq("status", "enriching");

    return NextResponse.json({ ok: true });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}
