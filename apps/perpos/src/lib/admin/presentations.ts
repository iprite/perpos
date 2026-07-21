/**
 * Presentation Desk — data access (admin, service-role)
 *
 * แยก fetch logic ออกจาก route/page ตามมาตรฐาน SERVER_COMPONENT_PATTERN
 * ใช้ admin client (bypass RLS) — เรียกเฉพาะหลังผ่าน guard super_admin แล้วเท่านั้น
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type DeckListItem = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  audience: string | null;
  format: "deck" | "one_pager";
  status: "draft" | "published";
  version: number;
  updated_at: string;
};

export type DeckVersion = {
  id: string;
  version: number;
  note: string | null;
  source: "manual" | "factory" | "ai_edit" | "revert";
  created_at: string;
};

export type DeckDetail = DeckListItem & {
  html: string;
  created_at: string;
  versions: DeckVersion[];
};

const LIST_COLS = "id, slug, title, description, audience, format, status, version, updated_at";

/** รายการ deck ทั้งหมด (ใหม่สุดก่อน) */
export async function listDecks(admin: SupabaseClient): Promise<DeckListItem[]> {
  const { data, error } = await admin
    .from("presentation_decks")
    .select(LIST_COLS)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DeckListItem[];
}

/** deck เดียว + ประวัติเวอร์ชัน — คืน null ถ้าไม่พบ */
export async function getDeck(admin: SupabaseClient, id: string): Promise<DeckDetail | null> {
  const { data: deck, error } = await admin
    .from("presentation_decks")
    .select(`${LIST_COLS}, html, created_at`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!deck) return null;

  const { data: versions } = await admin
    .from("presentation_deck_versions")
    .select("id, version, note, source, created_at")
    .eq("deck_id", id)
    .order("version", { ascending: false });

  return { ...(deck as DeckDetail), versions: (versions ?? []) as DeckVersion[] };
}
