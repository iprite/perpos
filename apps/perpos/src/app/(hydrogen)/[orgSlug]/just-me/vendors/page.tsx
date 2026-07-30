/**
 * /[orgSlug]/just-me/vendors — ทะเบียนผู้ขาย
 * ท่า: **server component + searchParams-driven** (คำค้น/รวมที่เลิกใช้ อยู่ใน URL)
 * contract §5 ข้อ 6 · guard = member + RLS (ห้าม service-role กับข้อมูล per-org)
 *
 * viewer อ่านได้ (ตารางนี้ไม่มีข้อมูลต้นทุน) แต่ "จำนวนครั้งที่ชนะราคา" อ่านจาก PR
 * ซึ่ง viewer ไม่มีสิทธิ์เห็น → ไม่ดึงให้เลย (ไม่ใช่แสดง 0 ที่ทำให้เข้าใจผิด)
 */

import { Truck } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { countVendorWins, listVendors } from "@/lib/just-me/purchasing";
import { requireJustMePage } from "../_components/guard";
import { VendorsClient, type VendorRow } from "./_vendors-client";

export const dynamic = "force-dynamic";

export default async function JustMeVendorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ q?: string; inactive?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireJustMePage(orgSlug);

  const q = (sp.q ?? "").trim();
  const includeInactive = sp.inactive === "1";

  const [vendors, wins] = await Promise.all([
    listVendors(ctx.rls, ctx.orgId, { q: q || undefined, includeInactive }),
    ctx.canSeeCost
      ? countVendorWins(ctx.rls, ctx.orgId)
      : Promise.resolve(new Map<string, number>()),
  ]);

  const rows: VendorRow[] = vendors.map((v) => ({
    id: v.id,
    name: v.name,
    tax_id: v.tax_id,
    phone: v.phone,
    email: v.email,
    address: v.address,
    contact_name: v.contact_name,
    note: v.note,
    is_active: v.is_active,
    win_count: ctx.canSeeCost ? (wins.get(v.id) ?? 0) : null,
  }));

  return (
    <PageShell
      title="ผู้ขาย"
      description="ทะเบียนซัพพลายเออร์ที่ใช้เทียบราคาและสั่งซื้อ"
      icon={<Truck className="h-6 w-6" />}
      width="full"
    >
      <VendorsClient
        orgId={ctx.orgId}
        canWrite={ctx.canWrite}
        canSeeCost={ctx.canSeeCost}
        rows={rows}
        q={q}
        includeInactive={includeInactive}
      />
    </PageShell>
  );
}
