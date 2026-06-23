import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../_lib/auth";
import { createAdminClient } from "../../../../_lib/supabase";
import { getDeck } from "@/lib/admin/presentations";
import { editDeckHtml } from "@/lib/admin/presentation-ai";

export const maxDuration = 60; // Gemini แก้ทั้งหน้าอาจกินเวลา ~10–40 วิ

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/presentations/[id]/edit — แก้ทั้ง deck ด้วย Gemini ตาม prompt
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const { id } = await params;

  const { prompt } = (await req.json().catch(() => ({}))) as { prompt?: string };
  if (!prompt?.trim()) return NextResponse.json({ error: "ต้องระบุคำสั่งแก้ไข" }, { status: 400 });

  const admin = createAdminClient();
  const { data: deck } = await admin
    .from("presentation_decks")
    .select("html, version")
    .eq("id", id)
    .maybeSingle();
  if (!deck) return NextResponse.json({ error: "ไม่พบ deck" }, { status: 404 });
  if (!deck.html?.trim())
    return NextResponse.json({ error: "deck ยังไม่มีเนื้อหา HTML ให้แก้" }, { status: 400 });

  const result = await editDeckHtml(deck.html, prompt.trim());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  const nextVersion = deck.version + 1;
  await admin.from("presentation_deck_versions").insert({
    deck_id: id,
    version: nextVersion,
    html: result.html,
    note: prompt.trim().slice(0, 280),
    source: "ai_edit",
    created_by: auth.userId,
  });
  await admin
    .from("presentation_decks")
    .update({ html: result.html, version: nextVersion, updated_by: auth.userId })
    .eq("id", id);

  const updated = await getDeck(admin, id);
  return NextResponse.json({ deck: updated });
}
