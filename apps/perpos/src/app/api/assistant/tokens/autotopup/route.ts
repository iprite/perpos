/**
 * GET/PUT /api/assistant/tokens/autotopup — ตั้งค่าเติมเครดิตอัตโนมัติ (per-profile)
 *   GET → สถานะปัจจุบัน + บัตรที่บันทึก + แพ็กที่เปิดขาย
 *   PUT body { enabled?, thresholdTokens?, packCode? } — เปิด/ปิด + buffer + แพ็ก auto-reload
 *     เปิด enabled ได้ต่อเมื่อมีบัตรบันทึกไว้ (stripe_payment_method_id) + เลือก pack แล้ว
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "../../../_lib/auth";
import { createAdminClient } from "../../../_lib/supabase";
import { getAutotopupConfig } from "@/lib/assistant/autotopup";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  const admin = createAdminClient();
  return NextResponse.json(await getAutotopupConfig(admin, auth.userId));
}

export async function PUT(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  const admin = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const { data: row } = await admin
    .from("token_autotopup")
    .select("stripe_payment_method_id, pack_code, threshold_tokens")
    .eq("profile_id", auth.userId)
    .maybeSingle();
  const cur = row as {
    stripe_payment_method_id: string | null;
    pack_code: string | null;
    threshold_tokens: number;
  } | null;

  const patch: Record<string, unknown> = {
    profile_id: auth.userId,
    updated_at: new Date().toISOString(),
  };

  if (typeof body.thresholdTokens === "number" && body.thresholdTokens >= 0) {
    patch.threshold_tokens = Math.floor(body.thresholdTokens);
  }
  if (typeof body.packCode === "string") {
    const { data: pack } = await admin
      .from("token_packs")
      .select("code")
      .eq("code", body.packCode)
      .eq("is_active", true)
      .maybeSingle();
    if (!pack) return NextResponse.json({ error: "pack_not_found" }, { status: 404 });
    patch.pack_code = body.packCode;
  }
  if (typeof body.enabled === "boolean") {
    if (body.enabled) {
      // เปิดได้ต่อเมื่อมีบัตร + เลือก pack
      const hasCard = !!cur?.stripe_payment_method_id;
      const packCode = (patch.pack_code as string | undefined) ?? cur?.pack_code ?? null;
      if (!hasCard) return NextResponse.json({ error: "no_card" }, { status: 400 });
      if (!packCode) return NextResponse.json({ error: "no_pack" }, { status: 400 });
      // กัน loop: threshold ต้องน้อยกว่า token ของ pack (ชาร์จ 1 ครั้งต้องดันยอดพ้น buffer)
      const finalThreshold =
        (patch.threshold_tokens as number | undefined) ?? cur?.threshold_tokens ?? 500;
      const { data: pk } = await admin
        .from("token_packs")
        .select("tokens")
        .eq("code", packCode)
        .maybeSingle();
      const packTokens = Number((pk as { tokens?: number } | null)?.tokens ?? 0);
      if (packTokens <= 0) return NextResponse.json({ error: "pack_not_found" }, { status: 404 });
      if (finalThreshold >= packTokens)
        return NextResponse.json({ error: "threshold_too_high", packTokens }, { status: 400 });
    }
    patch.enabled = body.enabled;
    patch.last_error = null; // เปิด/ปิดใหม่ → ล้าง error เดิม
  }

  await admin.from("token_autotopup").upsert(patch, { onConflict: "profile_id" });
  return NextResponse.json({ ok: true });
}
