import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { assertCallerIsAdmin } from "../_utils";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!url || !anonKey || !auth) {
    return NextResponse.json({ error: "missing_supabase_env", message: "Missing Supabase env or auth header." }, { status: 500 });
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: auth } },
  });

  const customersCandidates: Array<{ select: string; orderUpdatedAt: boolean }> = [
    { select: "id,name,email,display_id,created_at,updated_at", orderUpdatedAt: true },
    { select: "id,name,email,display_id,created_at", orderUpdatedAt: false },
    { select: "id,name,display_id,created_at", orderUpdatedAt: false },
  ];

  const repsCandidates: Array<{ select: string }> = [
    { select: "id,rep_code,email,prefix,first_name,last_name,profile_id,profile:profiles!company_representatives_profile_id_fkey(display_name,email)" },
    { select: "id,rep_code,email,first_name,last_name,profile_id,profile:profiles!company_representatives_profile_id_fkey(display_name,email)" },
    { select: "id,rep_code,email,profile_id,profile:profiles!company_representatives_profile_id_fkey(display_name,email)" },
    { select: "id,rep_code,email,prefix,first_name,last_name" },
    { select: "id,rep_code,email,first_name,last_name" },
    { select: "id,rep_code,email" },
    { select: "id,rep_code" },
  ];

  let customersData: any[] | null = null;
  let repsData: any[] | null = null;
  let lastCustomersError: any = null;
  let lastRepsError: any = null;

  for (const c of customersCandidates) {
    const q = supabase.from("customers").select(c.select);
    const res = c.orderUpdatedAt
      ? await q.order("updated_at", { ascending: false }).order("created_at", { ascending: false })
      : await q.order("created_at", { ascending: false });
    if (!res.error) {
      customersData = res.data ?? [];
      lastCustomersError = null;
      break;
    }
    lastCustomersError = res.error;
    const msg = String(res.error.message ?? "").toLowerCase();
    const isMissingColumn = msg.includes("does not exist");
    const isMissingUpdatedAt = msg.includes("updated_at") || msg.includes("customers.updated_at");
    const isMissingEmail = msg.includes("email") || msg.includes("customers.email");
    if (!(isMissingColumn && (isMissingUpdatedAt || isMissingEmail))) break;
  }

  for (const r of repsCandidates) {
    const res = await supabase.from("company_representatives").select(r.select).order("rep_code", { ascending: true });
    if (!res.error) {
      repsData = res.data ?? [];
      lastRepsError = null;
      break;
    }
    lastRepsError = res.error;
    const msg = String(res.error.message ?? "").toLowerCase();
    const isMissingColumn = msg.includes("does not exist");
    const isMissingRelationship = msg.includes("could not find a relationship") || msg.includes("relationship");
    if (!(isMissingColumn || isMissingRelationship)) break;
  }

  const firstError = lastCustomersError ?? lastRepsError;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 400 });
  }

  return NextResponse.json({
    customers: customersData ?? [],
    companyRepresentatives: repsData ?? [],
  });
}
