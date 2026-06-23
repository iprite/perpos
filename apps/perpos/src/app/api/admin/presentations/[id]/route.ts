import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../_lib/auth";
import { createAdminClient } from "../../../_lib/supabase";
import { getDeck } from "@/lib/admin/presentations";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/presentations/[id] — deck + versions
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const { id } = await params;

  try {
    const deck = await getDeck(createAdminClient(), id);
    if (!deck) return NextResponse.json({ error: "ไม่พบ deck" }, { status: 404 });
    return NextResponse.json({ deck });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PATCH /api/admin/presentations/[id] — แก้ meta/status, แทน HTML ตรง, หรือ revert เวอร์ชัน
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    audience?: string;
    status?: "draft" | "published";
    html?: string; // แทน HTML ตรง (บันทึกเป็น version ใหม่)
    revertToVersion?: number; // ย้อนกลับไปเวอร์ชันที่ระบุ
  };

  const admin = createAdminClient();
  const { data: deck } = await admin
    .from("presentation_decks")
    .select("version")
    .eq("id", id)
    .maybeSingle();
  if (!deck) return NextResponse.json({ error: "ไม่พบ deck" }, { status: 404 });

  // metadata อย่างเดียว
  const metaUpdate: Record<string, unknown> = { updated_by: auth.userId };
  if (typeof body.title === "string") metaUpdate.title = body.title.trim();
  if (typeof body.description === "string")
    metaUpdate.description = body.description.trim() || null;
  if (typeof body.audience === "string") metaUpdate.audience = body.audience.trim() || null;
  if (body.status === "draft" || body.status === "published") metaUpdate.status = body.status;

  // หา HTML ใหม่ (จาก revert หรือ replace) ถ้ามี
  let newHtml: string | null = null;
  let note = "";
  let source: "manual" | "revert" = "manual";

  if (typeof body.revertToVersion === "number") {
    const { data: v } = await admin
      .from("presentation_deck_versions")
      .select("html")
      .eq("deck_id", id)
      .eq("version", body.revertToVersion)
      .maybeSingle();
    if (!v) return NextResponse.json({ error: "ไม่พบเวอร์ชันที่ขอย้อนกลับ" }, { status: 404 });
    newHtml = v.html;
    note = `ย้อนกลับจาก v${body.revertToVersion}`;
    source = "revert";
  } else if (typeof body.html === "string") {
    newHtml = body.html;
    note = "แก้ HTML โดยตรง";
    source = "manual";
  }

  if (newHtml !== null) {
    const nextVersion = deck.version + 1;
    metaUpdate.html = newHtml;
    metaUpdate.version = nextVersion;
    await admin.from("presentation_deck_versions").insert({
      deck_id: id,
      version: nextVersion,
      html: newHtml,
      note,
      source,
      created_by: auth.userId,
    });
  }

  const { error } = await admin.from("presentation_decks").update(metaUpdate).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const updated = await getDeck(admin, id);
  return NextResponse.json({ deck: updated });
}

// DELETE /api/admin/presentations/[id]
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const { id } = await params;

  const { error } = await createAdminClient().from("presentation_decks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
