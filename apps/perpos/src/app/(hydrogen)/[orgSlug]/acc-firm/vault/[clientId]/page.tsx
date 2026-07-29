// [clientId]/page.tsx — แฟ้มลูกค้า 1 ราย · hybrid (server ดึง initial → client view)
// guard + RLS ผ่าน requireVaultPage เหมือนหน้าแรกของคลัง

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import {
  getChecklist,
  getClient,
  listCategories,
  listCustody,
  listDocuments,
  listPeriods,
} from "@/lib/acc-firm/vault/queries";
import { requireVaultPage } from "../_components/guard";
import { ClientVaultView } from "../_components/client-view";

export default async function VaultClientPage({
  params,
}: {
  params: Promise<{ orgSlug: string; clientId: string }>;
}) {
  const { orgSlug, clientId } = await params;
  const ctx = await requireVaultPage(orgSlug);

  const client = await getClient(ctx.rls, ctx.orgId, clientId);
  if (!client) notFound();

  const [periods, categories, documents, custody] = await Promise.all([
    listPeriods(ctx.rls, ctx.orgId, clientId),
    listCategories(ctx.rls),
    listDocuments(ctx.rls, ctx.orgId, { clientId }),
    listCustody(ctx.rls, ctx.orgId, clientId),
  ]);

  // งวดเริ่มต้น = งวดเดือนล่าสุดที่เปิดไว้ (ถ้ามี) → ดึง checklist มาพร้อมหน้า ไม่ต้องรอ fetch
  const initialPeriod = periods.find((p) => p.kind === "month") ?? null;
  const initialChecklist = initialPeriod
    ? await getChecklist(ctx.rls, ctx.orgId, initialPeriod.id)
    : [];

  return (
    <PageShell
      width="full"
      icon={<Building2 className="h-6 w-6" />}
      title={client.companyName}
      description={`รหัสลูกค้า ${client.clientCode} · แฟ้มเอกสารและทะเบียนรับ-ส่ง`}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href={`/${orgSlug}/acc-firm/vault`}>
            <ArrowLeft className="mr-1 h-4 w-4" /> กลับไปคลังเอกสาร
          </Link>
        </Button>
      }
    >
      <ClientVaultView
        orgId={ctx.orgId}
        canWrite={ctx.canWrite}
        canDownloadSensitive={ctx.canDownloadSensitive}
        client={client}
        periods={periods}
        initialPeriodId={initialPeriod?.id ?? null}
        initialChecklist={initialChecklist}
        categories={categories}
        documents={documents}
        custody={custody}
      />
    </PageShell>
  );
}
