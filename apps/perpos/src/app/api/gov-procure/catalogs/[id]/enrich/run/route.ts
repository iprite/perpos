// POST /api/gov-procure/catalogs/[id]/enrich/run?orgId= → ทำ 1 ก้อน (8 รายการ) แล้วคืน progress
//
// Q5(a): ไม่มี worker/cron — client วนเรียก endpoint นี้จนกว่าคิวจะหมด
// contract: §5.9 C-2 (claim ระดับ item) · A-12 (chunk_size ไม่รับจาก body) · C-4 (heartbeat) · C-5 (progress = aggregate)
//
// การ claim = **UPDATE … WHERE enrich_state='queued' … RETURNING** (ท่าเดียวกับ
// `acc-firm/ocr/jobs/process`) → 2 แท็บที่กดพร้อมกันจะได้คนละก้อน ไม่จ่ายค่า AI ซ้ำ

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../_lib/supabase";
import { setAuditContext } from "../../../../../_lib/audit";
import { requireGovProcureMember, canWrite, orgIdFromQuery, govError } from "../../../../_lib";
import { getCatalog, type CatalogItem, type CatalogJob } from "@/lib/gov-procure/catalog";
import { CHUNK_SIZE, estimateCost } from "@/lib/gov-procure/catalog-cost";
import { enrichCatalogChunk, type CatalogEnrichItemInput } from "@/lib/gov-procure/catalog-ai";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** 'running' ที่ค้างเกินเวลานี้ = รอบก่อนตายกลางทาง → คืนเข้าคิว (C-2) */
const RUNNING_STALE_MS = 3 * 60 * 1000;

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์สั่งให้ AI เติมข้อมูล", 403);

  const admin = createAdminClient();

  try {
    const catalog = await getCatalog(admin, orgId, id);
    if (!catalog) return govError("ไม่พบชุดแคตตาล็อกนี้", 404);

    const { data: jobs, error: jobErr } = await admin
      .from("gov_procure_catalog_jobs")
      .select("*")
      .eq("org_id", orgId)
      .eq("catalog_id", id)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (jobErr) return govError(jobErr.message, 500);
    const job = (jobs ?? [])[0] as CatalogJob | undefined;
    if (!job) return govError("ไม่มีงาน AI ที่กำลังทำอยู่ — กดเริ่มใหม่อีกครั้ง", 409);

    await setAuditContext(req, auth.userId, orgId);

    // คืนของที่ค้าง 'running' จากรอบที่ตายกลางทาง
    await admin
      .from("gov_procure_catalog_items")
      .update({ enrich_state: "queued" })
      .eq("org_id", orgId)
      .eq("catalog_id", id)
      .eq("enrich_state", "running")
      .lt("enrich_claimed_at", new Date(Date.now() - RUNNING_STALE_MS).toISOString());

    // ── claim 1 ก้อน (atomic) ─────────────────────────────────────────────
    const { data: queued, error: qErr } = await admin
      .from("gov_procure_catalog_items")
      .select("id")
      .eq("org_id", orgId)
      .eq("catalog_id", id)
      .eq("enrich_state", "queued")
      .order("seq_no", { ascending: true })
      .limit(CHUNK_SIZE);

    if (qErr) return govError(qErr.message, 500);
    const candidateIds = (queued ?? []).map((r) => (r as { id: string }).id);

    let claimed: CatalogItem[] = [];
    if (candidateIds.length > 0) {
      const { data: claimedRows, error: claimErr } = await admin
        .from("gov_procure_catalog_items")
        .update({
          enrich_state: "running",
          enrich_claimed_at: new Date().toISOString(),
          enrich_job_id: job.id,
        })
        .eq("org_id", orgId)
        .eq("catalog_id", id)
        .eq("enrich_state", "queued") // ← หัวใจของ atomic claim
        .in("id", candidateIds)
        .select("*");

      if (claimErr) return govError(claimErr.message, 500);
      claimed = (claimedRows ?? []) as CatalogItem[];
    }

    // ── ไม่มีอะไรให้ทำ = จบงาน (หรือรอบอื่นถืออยู่) ─────────────────────────
    if (claimed.length === 0) {
      const { count: remaining } = await admin
        .from("gov_procure_catalog_items")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("catalog_id", id)
        .in("enrich_state", ["queued", "running"]);

      if ((remaining ?? 0) > 0) {
        return NextResponse.json({ done: false, claimed: 0, remaining: remaining ?? 0, job });
      }

      const finished = await finalizeJob(admin, orgId, id, job);
      return NextResponse.json({ done: true, claimed: 0, remaining: 0, job: finished });
    }

    // ── เรียก AI (ไม่ throw ทุกกรณี — fallback = ทุกตัวอยู่ใน failed) ───────
    const refToId = new Map<string, CatalogItem>();
    const inputs: CatalogEnrichItemInput[] = claimed.map((it) => {
      let ref = `it-${it.id.slice(0, 8)}`;
      if (refToId.has(ref)) ref = `it-${it.id}`;
      refToId.set(ref, it);
      return { ref, name_raw: it.name_raw || it.name, qty: it.qty, unit: it.unit };
    });

    const outcome = await enrichCatalogChunk(
      {
        catalog_title: catalog.title,
        company: catalog.company ?? undefined,
        template: catalog.template,
      },
      inputs,
    );

    // ── เขียนผลรายตัว (ผลบางส่วนต้องไม่หายเมื่อบางตัวล้ม) ─────────────────
    let doneCount = 0;
    let failCount = 0;

    for (const r of outcome.results) {
      const item = refToId.get(r.ref);
      if (!item) continue;
      const f = r.fields;

      const patch: Record<string, unknown> = {
        name: f.name,
        brand_model: f.brand_model,
        spec_line: f.spec_line,
        size_line: f.size_line,
        bullets: f.bullets,
        care_notes: f.care_notes,
        caution_notes: f.caution_notes,
        ai_warnings: f.ai_warnings,
        ai_note: f.ai_note,
        sub_items: f.sub_items,
        category: f.category,
        confidence: f.confidence,
        source: "ai_draft",
        enrich_state: "done",
        enrich_error: null,
        enrich_claimed_at: null,
      };

      // ราคาที่ "คน" กรอกเองแล้ว ห้าม AI ทับ (C-B2 — badge ประมาณการต้องไม่กลับมา)
      if (!item.price_updated_by) {
        patch.unit_price_ref = f.unit_price_ref;
        patch.price_min = f.price_min;
        patch.price_max = f.price_max;
        patch.price_basis = f.price_basis;
        patch.price_confidence = f.price_confidence;
      }

      const { error } = await admin
        .from("gov_procure_catalog_items")
        .update(patch)
        .eq("id", item.id)
        .eq("org_id", orgId)
        .eq("catalog_id", id);

      if (error) {
        failCount += 1;
        console.warn("[gov-procure:catalog] เขียนผล AI ไม่สำเร็จ:", error.message);
        continue;
      }
      doneCount += 1;
    }

    for (const fl of outcome.failed) {
      const item = refToId.get(fl.ref);
      if (!item) continue;
      const { error } = await admin
        .from("gov_procure_catalog_items")
        .update({
          enrich_state: "failed",
          enrich_error: fl.reason.slice(0, 500),
          enrich_claimed_at: null,
        })
        .eq("id", item.id)
        .eq("org_id", orgId)
        .eq("catalog_id", id);
      if (!error) failCount += 1;
    }

    // ── อัปเดต job (progress + token/cost + heartbeat) ─────────────────────
    const { data: freshJobRow } = await admin
      .from("gov_procure_catalog_jobs")
      .select("done_items, failed_items, input_tokens, output_tokens, started_at")
      .eq("id", job.id)
      .eq("org_id", orgId)
      .maybeSingle();
    const fresh = (freshJobRow ?? job) as unknown as CatalogJob;

    const now = new Date().toISOString();
    const { data: updatedJob } = await admin
      .from("gov_procure_catalog_jobs")
      .update({
        status: "processing",
        started_at: fresh.started_at ?? now,
        heartbeat_at: now,
        done_items: Number(fresh.done_items ?? 0) + doneCount,
        failed_items: Number(fresh.failed_items ?? 0) + failCount,
        input_tokens: Number(fresh.input_tokens ?? 0) + outcome.meta.inputTokens,
        output_tokens: Number(fresh.output_tokens ?? 0) + outcome.meta.outputTokens,
        model: outcome.meta.model,
      })
      .eq("id", job.id)
      .eq("org_id", orgId)
      .select("*")
      .maybeSingle();

    let finalJob = (updatedJob ?? null) as CatalogJob | null;

    const { count: remaining } = await admin
      .from("gov_procure_catalog_items")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("catalog_id", id)
      .in("enrich_state", ["queued", "running"]);

    const isDone = (remaining ?? 0) === 0;
    if (isDone && finalJob) finalJob = await finalizeJob(admin, orgId, id, finalJob);

    return NextResponse.json({
      done: isDone,
      claimed: claimed.length,
      succeeded: doneCount,
      failed: failCount,
      remaining: remaining ?? 0,
      job: finalJob,
      cost: estimateCost(outcome.meta.inputTokens, outcome.meta.outputTokens),
    });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

/** ปิด job + คืนชุดให้แก้ไขต่อได้ (review — หรือ draft ถ้าไม่มีอะไรสำเร็จเลย) */
async function finalizeJob(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  catalogId: string,
  job: CatalogJob,
): Promise<CatalogJob> {
  const done = Number(job.done_items ?? 0);
  const { data } = await admin
    .from("gov_procure_catalog_jobs")
    .update({
      status: done > 0 ? "completed" : "failed",
      finished_at: new Date().toISOString(),
      error_message: done > 0 ? null : "AI เติมข้อมูลไม่สำเร็จเลยสักรายการ",
    })
    .eq("id", job.id)
    .eq("org_id", orgId)
    .in("status", ["pending", "processing"])
    .select("*")
    .maybeSingle();

  await admin
    .from("gov_procure_catalogs")
    .update({ status: done > 0 ? "review" : "draft" })
    .eq("id", catalogId)
    .eq("org_id", orgId)
    .eq("status", "enriching");

  return (data as CatalogJob | null) ?? job;
}
