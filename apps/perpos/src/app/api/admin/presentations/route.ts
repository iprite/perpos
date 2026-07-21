import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../_lib/auth";
import { createAdminClient } from "../../_lib/supabase";
import { listDecks } from "@/lib/admin/presentations";

// GET /api/admin/presentations — list decks (สำหรับ poll/refresh ฝั่ง client ถ้าจำเป็น)
//
// หมายเหตุ: ไม่มี POST create — deck ถูกผลิตโดย Presentation Factory (หลังบ้าน) เขียนตรงลง
// presentation_decks ผ่าน Supabase MCP execute_sql (service role). app ใช้สำหรับแก้/เผยแพร่เท่านั้น.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  try {
    const decks = await listDecks(createAdminClient());
    return NextResponse.json({ decks });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
