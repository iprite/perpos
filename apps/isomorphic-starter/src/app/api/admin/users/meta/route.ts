import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertCallerIsAdmin } from "../_utils";

export async function GET(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const admin = createSupabaseAdminClient();

  const [customersRes, repsRes] = await Promise.all([
    admin.from("customers").select("id,name,display_id,created_at").order("created_at", { ascending: false }),
    admin.from("company_representatives").select("id,rep_code").order("rep_code", { ascending: true }),
  ]);

  const firstError = customersRes.error ?? repsRes.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 400 });
  }

  return NextResponse.json({
    customers: customersRes.data ?? [],
    companyRepresentatives: repsRes.data ?? [],
  });
}
