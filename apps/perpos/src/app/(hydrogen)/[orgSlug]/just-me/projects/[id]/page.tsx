/**
 * /[orgSlug]/just-me/projects/[id] — รายละเอียดโครงการ
 * ท่า: **hybrid** — server ดึงข้อมูลตั้งต้น (SSR) → client view เพราะเป็นหน้า CRUD หนัก
 * contract §5 ข้อ 2 · guard = member + RLS
 *
 * ⚡ SSR โหลด **เฉพาะแท็บที่เปิดจริง** (ค่าเริ่มต้น = ภาพรวม) — แท็บอื่นโหลดตอนผู้ใช้กด
 *    ผ่าน `loadProjectTabAction` · ห้ามกลับไปดึงข้อมูลของทุกแท็บพร้อมกัน
 *
 * viewer: อ่านผ่าน view `*_basic` / `just_me_boq_items_sell` และ **ไม่ได้รับค่าต้นทุนใด ๆ ติดไปกับ props**
 * ⛔ ตัวเลขเงินมาจาก `lib/just-me/project-metrics.ts` เท่านั้น
 */

import { notFound } from "next/navigation";
import { getProject, loadProjectSummaries } from "@/lib/just-me/projects";
import { loadAccountingReadiness } from "@/lib/just-me/accounting-bridge";
import { requireJustMePage } from "../../_components/guard";
import { ProjectDetailClient } from "./_detail-client";
import { loadProjectTabData } from "./_tab-data";
import type { TabKey } from "./_types";

export const dynamic = "force-dynamic";

/** แท็บที่เปิดได้จากลิงก์ภายนอก (การ์ด LINE ส่ง `?tab=billings` มา) */
const DEEP_LINK_TABS: TabKey[] = ["overview", "files", "boq", "purchasing", "billings", "usage"];

export default async function JustMeProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgSlug, id } = await params;
  const { tab } = await searchParams;
  const initialTab: TabKey = DEEP_LINK_TABS.find((t) => t === tab) ?? "overview";
  const ctx = await requireJustMePage(orgSlug);

  const project = await getProject(ctx.rls, ctx.orgId, id, { basic: !ctx.canSeeCost });
  if (!project) notFound();

  // การ์ดสรุปเงิน + สถานะบัญชี = หัวของหน้า (ทุกแท็บใช้) · ที่เหลือดึงเฉพาะแท็บที่เปิด
  const [summaryMap, readiness, tabData] = await Promise.all([
    ctx.canSeeCost
      ? loadProjectSummaries(ctx.rls, ctx.orgId, [project])
      : Promise.resolve(new Map()),
    loadAccountingReadiness(ctx.rls, ctx.orgId),
    loadProjectTabData(ctx, project, initialTab),
  ]);

  return (
    <ProjectDetailClient
      orgId={ctx.orgId}
      orgSlug={orgSlug}
      canWrite={ctx.canWrite}
      canSeeCost={ctx.canSeeCost}
      initialTab={initialTab}
      initialTabData={tabData}
      core={{
        project,
        summary: summaryMap.get(project.id) ?? null,
        accounting: {
          configured: readiness.configured,
          vatRegistered: readiness.vat_registered,
          taxIdentityMissing: readiness.tax_identity_ready ? [] : readiness.missing,
        },
      }}
    />
  );
}
