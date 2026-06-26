/**
 * GET /api/acc-firm/close-check?orgId=<firmOrgId>&clientOrgId=<uuid>&year=<YYYY>&month=<M>
 *
 * ผู้ช่วยปิดงวด anomaly sweep (F3) — rule-based 5 กฎ + AI narration.
 * read-only (ไม่ mutate) → viewer เปิดได้, ไม่ต้องเช็ค canModuleWrite.
 *
 * guard:
 *   1. requireModuleMember(req, firmOrgId, 'acc_firm')
 *   2. IDOR — ตรวจ clientOrgId ∈ acc_firm_clients (active) ของ firmOrgId
 *      (กัน firm อ่าน org ที่ไม่ใช่ client ตัวเอง)
 *
 * เมื่อเรียก AI จริง → insert acc_firm_ai_log (cost/audit, D6).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../_lib/module-auth";
import { createAdminClient } from "../../_lib/supabase";
import { runCloseCheck, narrateAnomalies, type Anomaly } from "@/lib/acc-firm/close-check";

export type CloseCheckResponse = {
  clientOrgId: string;
  clientOrgName: string;
  year: number;
  month: number;
  anomalies: Anomaly[];
  narration: string | null;
  priority: string[];
  aiMeta?: { model: string; inputTokens: number; outputTokens: number };
  isClean: boolean;
};

// gpt-4o-mini pricing (USD ต่อ 1M tokens) — คำนวณ cost_usd ของ log
const COST_PER_M = { input: 0.15, output: 0.6 };

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  // ใช้เรต gpt-4o-mini เป็น default (model ปัจจุบันของ feature นี้)
  if (model.includes("gpt-4o-mini") || model.includes("gpt-4o")) {
    return (inputTokens * COST_PER_M.input + outputTokens * COST_PER_M.output) / 1_000_000;
  }
  return 0; // model อื่น → ไม่มี cost model ในเฟสนี้
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const firmOrgId = sp.get("orgId");
  const clientOrgId = sp.get("clientOrgId");
  const year = Number(sp.get("year"));
  const month = Number(sp.get("month"));

  if (!firmOrgId || !clientOrgId) {
    return NextResponse.json({ error: "missing orgId or clientOrgId" }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "ปีไม่ถูกต้อง" }, { status: 400 });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "เดือนไม่ถูกต้อง" }, { status: 400 });
  }

  const auth = await requireModuleMember(req, firmOrgId, "acc_firm");
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // IDOR guard — clientOrgId ต้องเป็น engagement active ของ firm นี้
  const { data: engagement, error: gErr } = await admin
    .from("acc_firm_clients")
    .select("client_org:organizations!acc_firm_clients_client_org_id_fkey (id, name)")
    .eq("firm_org_id", firmOrgId)
    .eq("client_org_id", clientOrgId)
    .eq("status", "active")
    .maybeSingle();
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });
  if (!engagement) {
    return NextResponse.json({ error: "ไม่พบลูกค้านี้ในความดูแลของสำนักงาน" }, { status: 403 });
  }
  const clientOrgName = (engagement.client_org as unknown as { name?: string } | null)?.name ?? "—";

  try {
    const result = await runCloseCheck(firmOrgId, clientOrgId, year, month, admin);
    const narration = await narrateAnomalies(result);

    // log cost/audit เมื่อเรียก AI จริง (มี narration.meta)
    if (narration) {
      const costUsd = estimateCostUsd(
        narration.meta.model,
        narration.meta.inputTokens,
        narration.meta.outputTokens,
      );
      // best-effort — log error ต้องไม่ทำ user request fail (จ่ายค่า AI ไปแล้ว)
      try {
        await admin.from("acc_firm_ai_log").insert({
          firm_org_id: firmOrgId,
          client_org_id: clientOrgId,
          feature: "close_check",
          model: narration.meta.model,
          input_tokens: narration.meta.inputTokens,
          output_tokens: narration.meta.outputTokens,
          cost_usd: costUsd,
          triggered_by: auth.userId,
        });
      } catch (logErr) {
        console.error("[acc-firm/close-check] ai_log insert failed", String(logErr));
      }
    }

    const res: CloseCheckResponse = {
      clientOrgId,
      clientOrgName,
      year,
      month,
      anomalies: result.anomalies,
      narration: narration?.narration ?? null,
      priority: narration?.priority ?? [],
      aiMeta: narration?.meta,
      isClean: result.anomalies.length === 0,
    };
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการตรวจปิดงวด" },
      { status: 500 },
    );
  }
}
