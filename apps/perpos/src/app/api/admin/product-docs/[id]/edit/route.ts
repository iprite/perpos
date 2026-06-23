import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../_lib/auth";
import { createAdminClient } from "../../../../_lib/supabase";
import { getDoc } from "@/lib/admin/product-docs";
import { editDocumentHtml } from "@/lib/admin/product-doc-ai";

export const maxDuration = 60; // Gemini แก้ทั้งหน้าอาจกินเวลา ~10–40 วิ

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/product-docs/[id]/edit — แก้ทั้งเอกสารด้วย Gemini ตาม prompt
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const { id } = await params;

  const { prompt } = (await req.json().catch(() => ({}))) as { prompt?: string };
  if (!prompt?.trim()) return NextResponse.json({ error: "ต้องระบุคำสั่งแก้ไข" }, { status: 400 });

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("product_documents")
    .select("html, version")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });
  if (!doc.html?.trim())
    return NextResponse.json({ error: "เอกสารยังไม่มีเนื้อหา HTML ให้แก้" }, { status: 400 });

  const result = await editDocumentHtml(doc.html, prompt.trim());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  const nextVersion = doc.version + 1;
  await admin.from("product_document_versions").insert({
    document_id: id,
    version: nextVersion,
    html: result.html,
    note: prompt.trim().slice(0, 280),
    source: "ai_edit",
    created_by: auth.userId,
  });
  await admin
    .from("product_documents")
    .update({ html: result.html, version: nextVersion, updated_by: auth.userId })
    .eq("id", id);

  const updated = await getDoc(admin, id);
  return NextResponse.json({ doc: updated });
}
