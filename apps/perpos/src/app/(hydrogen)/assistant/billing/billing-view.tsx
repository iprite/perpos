"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Loader2,
  Check,
  Wallet,
  Sparkles,
  CreditCard,
  RefreshCw,
  CalendarClock,
  Gift,
} from "lucide-react";
import { toast } from "@/lib/toast";
import type { AutotopupConfig } from "@/lib/assistant/autotopup";

type Quota = { balance_tokens: number; balance_thb: number; earliest_expiry: string | null };

const nf = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

export default function BillingView({
  initialQuota,
  initialAuto,
}: {
  initialQuota: Quota;
  initialAuto: AutotopupConfig;
}) {
  const search = useSearchParams();
  const supabase = createSupabaseBrowserClient();

  const [token, setToken] = useState("");
  const [quota, setQuota] = useState<Quota>(initialQuota);
  const [auto, setAuto] = useState<AutotopupConfig>(initialAuto);
  const [buying, setBuying] = useState("");
  const [saving, setSaving] = useState(false);

  // auto-topup form state — seed จาก initial (SSR)
  const [threshold, setThreshold] = useState(String(initialAuto.thresholdTokens ?? 500));
  const [packCode, setPackCode] = useState(
    initialAuto.packCode ?? initialAuto.packs[0]?.code ?? "",
  );

  // ดึง access token ครั้งเดียวสำหรับ mutation (ไม่ block การ render — ข้อมูลมาจาก SSR แล้ว)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? ""));
  }, [supabase]);

  // refresh quota + auto หลัง mutation
  const reload = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess.session?.access_token ?? "";
    if (!accessToken) return;
    const [quotaRes, autoRes] = await Promise.all([
      fetch(`/api/assistant/quota`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      fetch(`/api/assistant/tokens/autotopup`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);
    if (quotaRes.ok) setQuota((await quotaRes.json()).data as Quota);
    if (autoRes.ok) {
      const a = (await autoRes.json()) as AutotopupConfig;
      setAuto(a);
      setThreshold(String(a.thresholdTokens ?? 500));
      setPackCode(a.packCode ?? a.packs[0]?.code ?? "");
    }
  }, [supabase]);

  useEffect(() => {
    if (search.get("billing") === "success")
      toast.success("ชำระเงินสำเร็จ — เครดิตจะเข้าภายในไม่กี่วินาที");
    if (search.get("billing") === "canceled") toast("ยกเลิกการชำระเงิน", { icon: "ℹ️" });
    if (search.get("setup") === "success")
      toast.success("บันทึกบัตรสำเร็จ — เปิดเติมอัตโนมัติได้แล้ว");
  }, [search]);

  const buy = async (code: string, saveCard: boolean) => {
    if (!token) return;
    setBuying(code);
    try {
      const res = await fetch("/api/assistant/tokens/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ packCode: code, saveCard }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        toast.error("เริ่มชำระเงินไม่สำเร็จ");
        return;
      }
      window.location.href = data.url as string;
    } finally {
      setBuying("");
    }
  };

  const saveCard = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/assistant/tokens/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        toast.error("เปิดหน้าบันทึกบัตรไม่สำเร็จ");
        return;
      }
      window.location.href = data.url as string;
    } finally {
      setSaving(false);
    }
  };

  const saveAuto = async (patch: Record<string, unknown>) => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/assistant/tokens/autotopup", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          data.error === "threshold_too_high"
            ? "จุดเตือนต้องน้อยกว่าเครดิตของแพ็ก"
            : data.error === "no_card"
              ? "กรุณาบันทึกบัตรก่อน"
              : data.error === "no_pack"
                ? "กรุณาเลือกแพ็ก"
                : "บันทึกไม่สำเร็จ",
        );
        return;
      }
      toast.success("บันทึกแล้ว");
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const packs = auto.packs;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left — wallet + auto top-up */}
      <div className="lg:col-span-4 xl:col-span-3">
        <div className="space-y-4 lg:sticky lg:top-6">
          {/* wallet */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Wallet className="h-4 w-4" /> เครดิตคงเหลือ
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-gray-900">
                {nf(quota.balance_tokens)}
              </span>
              <span className="text-sm text-gray-400">≈ ฿{nf(Math.floor(quota.balance_thb))}</span>
            </div>
            {quota.earliest_expiry ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                <CalendarClock className="h-3.5 w-3.5" /> หมดอายุ {fmtDate(quota.earliest_expiry)}
              </p>
            ) : null}
          </div>

          {/* auto top-up */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <RefreshCw className="h-4 w-4 text-primary" /> เติมอัตโนมัติ
            </div>
            <p className="mt-1 text-xs text-gray-500">
              เมื่อเครดิตต่ำกว่าจุดที่ตั้ง ระบบจะตัดบัตรเติมแพ็กที่เลือกให้อัตโนมัติ
            </p>

            {/* card status */}
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
              <CreditCard className="h-4 w-4 text-gray-400" />
              {auto.hasCard ? (
                <span className="text-gray-700">
                  {(auto.card?.brand ?? "บัตร").toUpperCase()} •••• {auto.card?.last4 ?? "????"}
                </span>
              ) : (
                <span className="text-gray-500">ยังไม่ได้บันทึกบัตร</span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={saveCard}
              disabled={saving}
            >
              {auto.hasCard ? "เปลี่ยนบัตร" : "บันทึกบัตร"}
            </Button>

            {/* settings */}
            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="threshold">เติมเมื่อเครดิตต่ำกว่า</Label>
                <Input
                  id="threshold"
                  type="number"
                  min={0}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="pack">แพ็กที่จะเติมอัตโนมัติ</Label>
                <CustomSelect
                  value={packCode}
                  onChange={setPackCode}
                  options={packs.map((p) => ({
                    value: p.code,
                    label: `${p.name} — ${nf(p.tokens)} เครดิต`,
                  }))}
                  className="mt-1 w-full"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={saving}
                onClick={() => saveAuto({ thresholdTokens: Number(threshold), packCode })}
              >
                บันทึกการตั้งค่า
              </Button>

              {auto.enabled ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  disabled={saving}
                  onClick={() => saveAuto({ enabled: false })}
                >
                  ปิดเติมอัตโนมัติ
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="w-full"
                  disabled={saving || !auto.hasCard}
                  onClick={() =>
                    saveAuto({ enabled: true, thresholdTokens: Number(threshold), packCode })
                  }
                >
                  เปิดเติมอัตโนมัติ
                </Button>
              )}
              {auto.enabled ? (
                <p className="text-center text-xs font-medium text-green-600">✓ เปิดใช้งานอยู่</p>
              ) : null}
              {auto.lastError ? (
                <p className="text-center text-xs text-red-600">
                  ครั้งล่าสุดล้มเหลว — กรุณาเปลี่ยนบัตร
                </p>
              ) : null}
            </div>
          </div>

          <p className="flex items-start gap-1.5 px-1 text-xs text-gray-400">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" /> ชำระผ่าน Stripe ปลอดภัย
            · เราไม่เก็บเลขบัตร
          </p>
        </div>
      </div>

      {/* Right — packs */}
      <div className="lg:col-span-8 xl:col-span-9">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">เติมเครดิต</h2>
        <p className="mb-4 text-sm text-gray-500">
          1 บาท = 100 เครดิต · เครดิตมีอายุ 1 ปี · เติมก่อนหมดอายุ เครดิตเก่าจะถูกต่ออายุอีก 1
          ปีอัตโนมัติ
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {packs.map((p, i) => (
            <div
              key={p.code}
              className={`relative rounded-2xl border bg-white p-6 shadow-sm ${i === 1 ? "border-primary ring-1 ring-gray-200" : "border-gray-100"}`}
            >
              {i === 1 ? (
                <div className="absolute right-4 top-4 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600">
                  แนะนำ
                </div>
              ) : null}
              <div className="text-base font-medium text-gray-900">{p.name}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold tabular-nums text-gray-900">
                  {nf(p.tokens)}
                </span>
                <span className="text-sm text-gray-500">เครดิต</span>
              </div>
              {p.bonus_tokens > 0 ? (
                <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">
                  <Gift className="h-3 w-3" /> โบนัส +{nf(p.bonus_tokens)}
                </div>
              ) : null}
              <Button
                className="mt-5 w-full"
                disabled={!!buying}
                onClick={() => buy(p.code, false)}
              >
                {buying === p.code ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-4 w-4" />
                )}{" "}
                เติม ฿{nf(p.price)}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 w-full text-xs"
                disabled={!!buying}
                onClick={() => buy(p.code, true)}
              >
                เติม + บันทึกบัตรไว้เติมอัตโนมัติ
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
