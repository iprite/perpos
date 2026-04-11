"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { PettyCashTransactionModal } from "@/components/petty-cash/petty-cash-transaction-modal";

type CategoryRow = { id: string; name: string; is_active: boolean; sort_order: number };

export default function PettyCashNewPage() {
  const router = useRouter();
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  const canUsePage = role === "admin" || role === "sale" || role === "operation";

  const loadCats = useCallback(async () => {
    if (!canUsePage) return;
    const { data, error } = await supabase.from("petty_cash_categories").select("id,name,is_active,sort_order").order("sort_order", { ascending: true });
    if (!error) setCategories((data ?? []) as any);
  }, [canUsePage, supabase]);

  React.useEffect(() => {
    loadCats();
  }, [loadCats]);

  return (
    <>
      {error ? <div className="p-6 text-sm text-red-700">{error}</div> : null}
      <PettyCashTransactionModal
        open
        mode="create"
        supabase={supabase as any}
        userId={userId}
        role={role}
        loading={loading}
        setLoading={setLoading}
        setError={setError}
        categories={categories as any}
        initial={{ txn_type: "SPEND" } as any}
        onSaved={() => {
          toast.success("บันทึกสำเร็จ");
          router.push("/finance/petty-cash");
        }}
        onClose={() => router.push("/finance/petty-cash")}
      />
    </>
  );
}

