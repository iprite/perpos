// lib/gov-procure/line-group.ts — LINE group ของทีมนักลงทุน (1 กลุ่มต่อ org)
// หน้าที่: ผูก/เลิกผูกกลุ่ม + ตอบคำสั่งรายงานในกลุ่ม + เป็นปลายทาง push ของ T1/T2/T3
// ความปลอดภัย: ผูกได้เฉพาะคนที่เป็น owner/manager ของ module ใน org นั้น (หรือ super_admin)
//   — คนอื่นในกลุ่มพิมพ์คำสั่งผูกไม่ได้ · กลุ่มที่ยังไม่ผูก บอทจะเงียบ (ไม่สแปมกลุ่มคนอื่น)

import type { SupabaseClient } from "@supabase/supabase-js";
import { listOrders } from "./orders";
import { getSettings } from "./settings";
import { computeSummary } from "./summary";
import { listInvestors, listCapitalFlows, computeCapital } from "./capital";
import { MODULE_KEY, getOrgSlug } from "./notify";
import {
  cmdContribution,
  cmdMoveCapital,
  cmdStage,
  cmdNewOrder,
  type CmdReply,
} from "./line-commands";
import { buildJobSummaryFlex, buildCapitalSummaryFlex } from "./line-cards";
import { STAGE_LABELS } from "./stage";

/** org ที่ผูกกับกลุ่มนี้ — null ถ้ากลุ่มยังไม่ถูกผูก */
export async function orgIdForGroup(
  admin: SupabaseClient,
  groupId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("gov_procure_settings")
    .select("org_id")
    .eq("line_group_id", groupId)
    .maybeSingle();
  return (data as { org_id: string } | null)?.org_id ?? null;
}

/** line_group_id ที่ org นี้ผูกไว้ (ถ้ามี) — ใช้เป็นปลายทาง push */
export async function groupTargetForOrg(
  admin: SupabaseClient,
  orgId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("gov_procure_settings")
    .select("line_group_id")
    .eq("org_id", orgId)
    .maybeSingle();
  const gid = (data as { line_group_id: string | null } | null)?.line_group_id;
  return gid && gid.trim() ? gid.trim() : null;
}

/** org ที่ผู้ใช้คนนี้มีสิทธิ์ผูกกลุ่ม (owner/manager ของ module · super_admin = ทุก org ที่เปิด) */
async function orgsUserCanBind(admin: SupabaseClient, profileId: string): Promise<string[]> {
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .maybeSingle();

  if ((profile as { role?: string } | null)?.role === "super_admin") {
    const { data } = await admin
      .from("org_module_settings")
      .select("organization_id")
      .eq("module_key", MODULE_KEY)
      .eq("is_enabled", true);
    return (data ?? []).map((r) => (r as { organization_id: string }).organization_id);
  }

  const { data } = await admin
    .from("module_members")
    .select("org_id")
    .eq("module_key", MODULE_KEY)
    .eq("user_id", profileId)
    .eq("is_active", true)
    .in("module_role", ["owner", "manager"]);
  return (data ?? []).map((r) => (r as { org_id: string }).org_id);
}

export type GroupReply = CmdReply;

/** ผูกกลุ่มนี้เข้ากับ org ของผู้สั่ง — 1 org มีได้กลุ่มเดียว, 1 กลุ่มผูกได้ org เดียว */
export async function bindGroup(
  admin: SupabaseClient,
  groupId: string,
  profileId: string | null,
): Promise<GroupReply> {
  if (!profileId) {
    return { text: "❌ ผูกกลุ่มไม่สำเร็จ — ยังไม่พบบัญชีของคุณในระบบ (แอด LINE ของ Perpos ก่อน)" };
  }

  const orgIds = await orgsUserCanBind(admin, profileId);
  if (!orgIds.length) {
    return {
      text: "❌ คุณไม่มีสิทธิ์ผูกกลุ่ม — ต้องเป็นเจ้าของหรือผู้จัดการของโมดูลจัดซื้อครุภัณฑ์ภาครัฐ",
    };
  }
  if (orgIds.length > 1) {
    return { text: "❌ คุณอยู่หลายองค์กร — กรุณาผูกกลุ่มจากหน้าตั้งค่าบนเว็บแทน" };
  }

  const orgId = orgIds[0];

  // กลุ่มนี้ถูกผูกกับ org อื่นไปแล้ว?
  const boundTo = await orgIdForGroup(admin, groupId);
  if (boundTo && boundTo !== orgId) {
    return { text: "❌ กลุ่มนี้ถูกผูกกับอีกองค์กรไปแล้ว" };
  }
  if (boundTo === orgId) {
    return { text: "กลุ่มนี้ผูกไว้อยู่แล้ว ✅ พิมพ์ /สรุป เพื่อดูรายงานล่าสุด" };
  }

  // org นี้ผูกกลุ่มอื่นอยู่ไหม (มีได้กลุ่มเดียว → ทับของเดิม)
  const current = await groupTargetForOrg(admin, orgId);

  const { error } = await admin.from("gov_procure_settings").upsert(
    {
      org_id: orgId,
      line_group_id: groupId,
      line_group_bound_at: new Date().toISOString(),
      line_group_bound_by: profileId,
    },
    { onConflict: "org_id" },
  );
  if (error) return { text: `❌ ผูกกลุ่มไม่สำเร็จ: ${error.message}` };

  const note = current ? "\n\n⚠️ กลุ่มเดิมที่เคยผูกไว้ถูกยกเลิกอัตโนมัติ (ผูกได้กลุ่มเดียว)" : "";
  return {
    text:
      "✅ ผูกกลุ่มสำเร็จ\n\nจากนี้กลุ่มนี้จะได้รับ:\n• แจ้งเตือนเมื่องานเปลี่ยนสถานะ\n• รายงานพอร์ตรายสัปดาห์ (จันทร์เช้า)\n• เตือนเงินค้างรับเกินกำหนด\n\nคำสั่งที่ใช้ได้:\n/สรุป — ภาพรวมงาน\n/กองทุน — เงินลงทุนและกำไร\n/เลิกผูกกลุ่ม" +
      note,
  };
}

export async function unbindGroup(
  admin: SupabaseClient,
  groupId: string,
  profileId: string | null,
): Promise<GroupReply> {
  const orgId = await orgIdForGroup(admin, groupId);
  if (!orgId) return { text: "กลุ่มนี้ยังไม่ได้ผูกกับระบบ" };

  if (!profileId || !(await orgsUserCanBind(admin, profileId)).includes(orgId)) {
    return { text: "❌ คุณไม่มีสิทธิ์เลิกผูกกลุ่ม (ต้องเป็นเจ้าของหรือผู้จัดการ)" };
  }

  const { error } = await admin
    .from("gov_procure_settings")
    .update({ line_group_id: null, line_group_bound_at: null, line_group_bound_by: null })
    .eq("org_id", orgId);
  if (error) return { text: `❌ เลิกผูกไม่สำเร็จ: ${error.message}` };

  return { text: "✅ เลิกผูกกลุ่มแล้ว — กลุ่มนี้จะไม่ได้รับแจ้งเตือนอีก" };
}

/** /สรุป — ภาพรวมงานของ org (Flex) */
export async function buildJobSummaryCard(admin: SupabaseClient, orgId: string) {
  const [orders, settings] = await Promise.all([
    listOrders(admin, orgId),
    getSettings(admin, orgId),
  ]);
  const summary = computeSummary(orders, settings.sla_threshold);

  const msg = buildJobSummaryFlex({
    summary,
    orderCount: orders.length,
    stageLabels: STAGE_LABELS,
  });
  return {
    flex: (msg as { contents: unknown }).contents,
    altText: (msg as { altText: string }).altText,
  };
}

/** /กองทุน — เงินลงทุน กระจายตัว และกำไรที่พร้อมปันผล (Flex) */
export async function buildCapitalSummaryCard(admin: SupabaseClient, orgId: string) {
  const [orders, investors, flows] = await Promise.all([
    listOrders(admin, orgId),
    listInvestors(admin, orgId),
    listCapitalFlows(admin, orgId),
  ]);
  const c = computeCapital(orders, investors, flows);

  const msg = buildCapitalSummaryFlex({
    totalContributed: c.totalContributed,
    poolBalance: c.poolBalance,
    totalProfitRealized: c.totalProfitRealized,
    totalDistributable: c.totalDistributable,
    companies: c.byCompany.map((x) => ({
      company: x.company,
      capitalHeld: x.capitalHeld,
      pipelineValue: x.pipelineValue,
      distributable: x.distributable,
    })),
    investors: c.byInvestor.map((b) => ({
      name: b.investor.name,
      sharePct: b.investor.share_pct,
      contributed: b.contributed,
      outstanding: b.outstanding,
    })),
  });
  return {
    flex: (msg as { contents: unknown }).contents,
    altText: (msg as { altText: string }).altText,
  };
}

const HELP = [
  "🤖 คำสั่งในกลุ่มนี้",
  "",
  "📊 ดูข้อมูล",
  "/สรุป — ภาพรวมงานจัดซื้อ",
  "/กองทุน — เงินลงทุน กำไร ปันผล",
  "",
  "✍️ บันทึกข้อมูล",
  "/ลงขัน <ชื่อ> <จำนวน>",
  "   เช่น /ลงขัน Bank 60000",
  "/กระจายทุน <บริษัท> <จำนวน>",
  "   เช่น /กระจายทุน 89 45000",
  "/คืนทุน <บริษัท> <จำนวน>",
  "   เช่น /คืนทุน p2p 20000",
  "/สถานะ <เลขที่ QT> <สถานะ>",
  "   เช่น /สถานะ QT2026060001 ส่งของแล้ว",
  "/งานใหม่ <บริษัท> | <กอง> | <รายการ> | <ราคา>",
  "   เช่น /งานใหม่ 89 | กองคลัง | ตู้เอกสาร | 45000",
  "",
  "💡 รายการที่เกี่ยวกับเงินต้องกดยืนยันก่อนบันทึกทุกครั้ง",
  "",
  "⚙️ /ผูกกลุ่ม · /เลิกผูกกลุ่ม (เจ้าของ/ผู้จัดการ)",
].join("\n");

/**
 * router คำสั่งในกลุ่ม — คืน text ที่จะ reply (null = ไม่ตอบ, ปล่อยเงียบ)
 * กลุ่มที่ยังไม่ผูก: ตอบเฉพาะ /ผูกกลุ่ม เท่านั้น (กันบอทพูดในกลุ่มที่ไม่เกี่ยว)
 */
export async function handleGovGroupCommand(
  admin: SupabaseClient,
  groupId: string,
  profileId: string | null,
  text: string,
): Promise<GroupReply> {
  const cmd = text.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

  if (cmd === "/ผูกกลุ่ม" || cmd === "/bindgroup") return bindGroup(admin, groupId, profileId);

  const orgId = await orgIdForGroup(admin, groupId);
  if (!orgId) return null; // ยังไม่ผูก → เงียบ

  if (cmd === "/เลิกผูกกลุ่ม" || cmd === "/unbindgroup")
    return unbindGroup(admin, groupId, profileId);
  if (cmd === "/สรุป" || cmd === "/งาน") return buildJobSummaryCard(admin, orgId);
  if (cmd === "/กองทุน" || cmd === "/ทุน") return buildCapitalSummaryCard(admin, orgId);
  if (cmd === "/help" || cmd === "/ช่วยเหลือ") return { text: HELP };

  // ── คำสั่งบันทึกข้อมูล ──
  const args = text.trim().split(/\s+/).slice(1);
  if (cmd === "/ลงขัน") return cmdContribution(admin, orgId, groupId, profileId, args);
  if (cmd === "/กระจายทุน")
    return cmdMoveCapital(admin, orgId, groupId, profileId, "allocation", args);
  if (cmd === "/คืนทุน")
    return cmdMoveCapital(admin, orgId, groupId, profileId, "return_to_pool", args);
  if (cmd === "/สถานะ") return cmdStage(admin, orgId, profileId, args);
  if (cmd === "/งานใหม่") {
    const rest = text.trim().slice(cmd.length).trim();
    return cmdNewOrder(admin, orgId, groupId, profileId, rest);
  }

  return null;
}
