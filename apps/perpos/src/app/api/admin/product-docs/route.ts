import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../_lib/auth";
import { createAdminClient } from "../../_lib/supabase";
import { listDocs } from "@/lib/admin/product-docs";

// GET /api/admin/product-docs — list
//
// ไม่มี POST create — เอกสารถูกผลิตโดย Documentation Factory (หลังบ้าน) เขียนตรงลง product_documents
// ผ่าน Supabase MCP execute_sql (service role). app ใช้สำหรับแก้/เผยแพร่/export PDF เท่านั้น.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  try {
    const docs = await listDocs(createAdminClient());
    return NextResponse.json({ docs });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
