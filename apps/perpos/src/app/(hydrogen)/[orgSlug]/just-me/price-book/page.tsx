/**
 * /[orgSlug]/just-me/price-book — ราคามาตรฐาน (ต้นทุน 3 ก้อน + margin + ราคาขาย)
 * ท่า: server ดึงข้อมูลตั้งต้น → client (CRUD หนัก + คำนวณสด) ตาม contract §5 ข้อ 3
 *
 * ⛔ viewer เข้าไม่ได้เลย — ทั้งหน้าเป็นข้อมูลต้นทุน/กำไร (เมนูซ่อนอยู่แล้ว แต่พิมพ์ URL ตรงต้องไม่หลุด)
 */

import { Lock, Tags } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Text } from "@/components/ui/typography";
import {
  getSettings,
  listInventoryItemOptions,
  listPriceBook,
  listWorkCategories,
} from "@/lib/just-me/price-book";
import { requireJustMePage } from "../_components/guard";
import { PriceBookClient } from "./_price-book-client";

export const dynamic = "force-dynamic";

export default async function JustMePriceBookPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireJustMePage(orgSlug);

  if (!ctx.canSeeCost) {
    return (
      <PageShell title="ราคามาตรฐาน" icon={<Tags className="h-6 w-6" />}>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="rounded-full bg-gray-100 p-4">
            <Lock className="h-8 w-8 text-gray-400" />
          </div>
          <Text className="text-sm font-medium text-gray-900">คุณไม่มีสิทธิ์เข้าหน้านี้</Text>
          <Text className="max-w-md text-sm text-gray-500">
            ราคามาตรฐานมีข้อมูลต้นทุนและกำไร จึงเปิดให้เฉพาะเจ้าของและผู้จัดการเท่านั้น
          </Text>
        </div>
      </PageShell>
    );
  }

  const [rows, categories, settings, items] = await Promise.all([
    listPriceBook(ctx.rls, ctx.orgId, { includeInactive: true }),
    listWorkCategories(ctx.rls, ctx.orgId, { includeInactive: true }),
    getSettings(ctx.rls, ctx.orgId),
    listInventoryItemOptions(ctx.rls, ctx.orgId),
  ]);

  return (
    <PriceBookClient
      orgId={ctx.orgId}
      isOwner={ctx.role === "owner"}
      canWrite={ctx.canWrite}
      rows={rows}
      categories={categories}
      settings={settings}
      items={items}
    />
  );
}
