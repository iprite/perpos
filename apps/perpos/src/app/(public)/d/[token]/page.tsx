// (public)/d/[token] — หน้าเอกสารสำหรับ "ลูกค้าปลายทาง" (ไม่ต้อง login, Phase 2)
//   ผู้ขายกดแชร์ → ได้ลิงก์ capability URL → ลูกค้าเปิดดูเอกสารจริง + โหลด PDF ได้
//   สิทธิ์ = การถือ token เท่านั้น → เพิกถอน/หมดอายุมีผลทันที (lookupShare)
//   หน้านี้เป็น Server Component ล้วน (ตามมาตรฐาน perf) และ noindex เสมอ

import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getDocument } from "@/lib/accounting/documents";
import { buildDocumentHtml } from "@/lib/accounting/document-html";
import { lookupShare, touchShare } from "@/lib/accounting/document-share";
import { DOC_TYPE_LABEL } from "@/lib/accounting/types";

export const dynamic = "force-dynamic";

// ลิงก์เป็นความลับ — ห้าม search engine เก็บ index เด็ดขาด
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "เอกสาร",
};

function Notice({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">{detail}</p>
      </div>
    </main>
  );
}

export default async function PublicDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const found = await lookupShare(admin, token);
  if (!found.ok) {
    const detail =
      found.reason === "revoked"
        ? "ผู้ออกเอกสารยกเลิกลิงก์นี้แล้ว กรุณาติดต่อผู้ออกเอกสารเพื่อขอลิงก์ใหม่"
        : found.reason === "expired"
          ? "ลิงก์นี้หมดอายุแล้ว กรุณาติดต่อผู้ออกเอกสารเพื่อขอลิงก์ใหม่"
          : "ลิงก์ไม่ถูกต้อง หรือถูกยกเลิกไปแล้ว";
    return <Notice title="เปิดเอกสารไม่ได้" detail={detail} />;
  }

  const doc = await getDocument(admin, found.share.org_id, found.share.document_id);
  if (!doc) return <Notice title="ไม่พบเอกสาร" detail="เอกสารนี้อาจถูกลบไปแล้ว" />;

  const { data: settings } = await admin
    .from("acc_org_settings")
    .select("logo_data_url, signature_data_url")
    .eq("org_id", found.share.org_id)
    .maybeSingle();

  const html = buildDocumentHtml(doc, doc.lines ?? [], {
    copy: false, // ลูกค้าได้ต้นฉบับเสมอ
    orgSettings: settings as {
      logo_data_url?: string | null;
      signature_data_url?: string | null;
    } | null,
  });

  void touchShare(admin, token); // นับยอดเปิด (best-effort, ไม่ block การแสดงผล)

  const label = DOC_TYPE_LABEL[doc.doc_type] ?? "เอกสาร";

  return (
    <main className="min-h-screen bg-gray-50 py-6">
      <div className="mx-auto w-full max-w-4xl px-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {label} เลขที่ {doc.doc_number}
            </h1>
            <p className="text-sm text-gray-500">จาก {doc.seller_name ?? "-"}</p>
          </div>
          <a
            href={`/api/public/document/${token}/pdf`}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
          >
            ดาวน์โหลด PDF
          </a>
        </div>

        {/* เอกสารจริงจากตัว render เดียวกับ PDF — ลูกค้าเห็นตรงกับที่พิมพ์ออกมา */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <iframe
            title={`${label} ${doc.doc_number}`}
            srcDoc={html}
            sandbox=""
            className="h-[1180px] w-full border-0"
          />
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          เอกสารนี้ส่งถึงคุณผ่านลิงก์เฉพาะ — กรุณาอย่าเผยแพร่ต่อสาธารณะ
        </p>
      </div>
    </main>
  );
}
