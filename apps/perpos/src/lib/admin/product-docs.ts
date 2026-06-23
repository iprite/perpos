/**
 * Product Documents — data access (admin, service-role)
 *
 * แยก fetch logic ออกจาก route/page (มาตรฐาน SERVER_COMPONENT_PATTERN)
 * ใช้ admin client (bypass RLS) — เรียกหลังผ่าน guard super_admin เท่านั้น
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type DocType = "manual" | "guide" | "faq" | "release_notes" | "spec" | "other";

export type ProductDocListItem = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  audience: string | null;
  doc_type: DocType;
  status: "draft" | "published";
  version: number;
  updated_at: string;
};

export type ProductDocVersion = {
  id: string;
  version: number;
  note: string | null;
  source: "manual" | "factory" | "ai_edit" | "revert";
  created_at: string;
};

export type ProductDocDetail = ProductDocListItem & {
  html: string;
  created_at: string;
  versions: ProductDocVersion[];
};

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  manual: "คู่มือใช้งาน",
  guide: "ไกด์",
  faq: "คำถามพบบ่อย",
  release_notes: "บันทึกอัปเดต",
  spec: "สเปก",
  other: "อื่น ๆ",
};

const LIST_COLS = "id, slug, title, description, audience, doc_type, status, version, updated_at";

/** รายการเอกสารทั้งหมด (ใหม่สุดก่อน) */
export async function listDocs(admin: SupabaseClient): Promise<ProductDocListItem[]> {
  const { data, error } = await admin
    .from("product_documents")
    .select(LIST_COLS)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductDocListItem[];
}

/** เอกสารเดียว + ประวัติเวอร์ชัน — คืน null ถ้าไม่พบ */
export async function getDoc(admin: SupabaseClient, id: string): Promise<ProductDocDetail | null> {
  const { data: doc, error } = await admin
    .from("product_documents")
    .select(`${LIST_COLS}, html, created_at`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!doc) return null;

  const { data: versions } = await admin
    .from("product_document_versions")
    .select("id, version, note, source, created_at")
    .eq("document_id", id)
    .order("version", { ascending: false });

  return { ...(doc as ProductDocDetail), versions: (versions ?? []) as ProductDocVersion[] };
}
