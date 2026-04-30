import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertCallerIsAdmin } from "../_utils";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: "missing_supabase_admin_env", message: String(e?.message ?? "") }, { status: 500 });
  }

  const [customersRes, repsRes] = await Promise.all([
    admin
      .from("customers")
      .select("id,name,display_id,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false }),
    admin.from("company_representatives").select("id,rep_code").order("rep_code", { ascending: true }),
  ]);

  if (customersRes.error && !repsRes.error) {
    const msg = String(customersRes.error.message ?? "");
    if (msg.includes("customers.updated_at") || (msg.includes("updated_at") && msg.toLowerCase().includes("does not exist"))) {
      const fallback = await admin.from("customers").select("id,name,display_id,created_at").order("created_at", { ascending: false });
      if (!fallback.error) {
        return NextResponse.json({ customers: fallback.data ?? [], companyRepresentatives: repsRes.data ?? [] });
      }
    }
  }

  const firstError = customersRes.error ?? repsRes.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 400 });
  }

  return NextResponse.json({
    customers: customersRes.data ?? [],
    companyRepresentatives: repsRes.data ?? [],
  });
}
