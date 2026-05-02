import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const QuerySchema = z.object({
  rep_code: z.string().trim().min(1),
  q: z.string().trim().min(2),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      rep_code: url.searchParams.get("rep_code") ?? "",
      q: url.searchParams.get("q") ?? "",
    });
    if (!parsed.success) {
      return NextResponse.json({ ok: true, items: [] }, { status: 200 });
    }
    const repCode = parsed.data.rep_code;
    const q = parsed.data.q;
    const like = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

    const admin = createSupabaseAdminClient();

    const repRes = await admin.from("company_representatives").select("profile_id").eq("rep_code", repCode).maybeSingle();
    const repProfileId = repRes.data ? (repRes.data as any).profile_id : null;
    if (!repProfileId) return NextResponse.json({ ok: true, items: [] }, { status: 200 });

    const ownRes = await admin
      .from("customers")
      .select("id,name,tax_id,phone,address,business_type,created_at")
      .eq("created_by_profile_id", repProfileId)
      .ilike("name", like)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(8);
    if (ownRes.error) return NextResponse.json({ ok: true, items: [] }, { status: 200 });

    const linkRes = await admin
      .from("customer_representatives")
      .select("customer_id")
      .eq("profile_id", repProfileId)
      .eq("status", "active")
      .limit(2000);
    if (linkRes.error) return NextResponse.json({ ok: true, items: (ownRes.data ?? []) as any[] }, { status: 200 });

    const linkedIds = Array.from(
      new Set(((linkRes.data ?? []) as any[]).map((r) => String(r.customer_id)).filter((x) => x && x !== "null")),
    );

    let linkedCustomers: any[] = [];
    if (linkedIds.length) {
      const linkedRes = await admin
        .from("customers")
        .select("id,name,tax_id,phone,address,business_type,created_at")
        .in("id", linkedIds)
        .ilike("name", like)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(8);
      if (!linkedRes.error) linkedCustomers = (linkedRes.data ?? []) as any[];
    }

    const seen = new Set<string>();
    const merged = ([] as any[]).concat((ownRes.data ?? []) as any[], linkedCustomers).filter((r) => {
      const id = String((r as any).id ?? "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    return NextResponse.json({ ok: true, items: merged.slice(0, 8) }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true, items: [] }, { status: 200 });
  }
}

