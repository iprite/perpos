/**
 * POST /api/assistant/recall/cancel  (requireAssistantUser)
 *   web "ยกเลิกบอท" — นำบอทออกจากห้อง/ยกเลิกนัด + คืนโควต้าตามกติกา (shared lib กับ LINE)
 *   body: { jobId }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAssistantUser } from "../../../_lib/assistant-auth";
import { createAdminClient } from "../../../_lib/supabase";
import { cancelBotJob, type CancelBotJobRow } from "@/lib/assistant/recall-bot";

export async function POST(req: NextRequest) {
  const auth = await requireAssistantUser(req);
  if (!auth.ok) return auth.res;

  const body = (await req.json().catch(() => ({}))) as { jobId?: string };
  const jobId = String(body.jobId ?? "");
  if (!jobId) return NextResponse.json({ ok: false, reason: "missing_job" });

  const admin = createAdminClient();
  const { data: jobData } = await admin
    .from("assistant_jobs")
    .select("id, profile_id, recall_bot_id, bot_state, recording_started_at")
    .eq("id", jobId)
    .eq("profile_id", auth.userId) // เจ้าของเท่านั้น (กันยกเลิกบอทคนอื่น)
    .maybeSingle();
  const job = jobData as CancelBotJobRow | null;
  if (!job) return NextResponse.json({ ok: false, reason: "not_found" });

  const outcome = await cancelBotJob(admin, job);
  return NextResponse.json({ ok: true, outcome: outcome.kind });
}
