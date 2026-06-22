"use client";

import { useEffect, useState, useCallback } from "react";
import { Coins, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AdminPage, AdminCard } from "../_components/admin-page";
import { PaymentsTabs } from "../payments/_tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";

type Rate = { service: string; unit: string; tokens_per_unit: number };
type Pack = {
  code: string;
  name: string;
  price: number;
  tokens: number;
  bonus_tokens: number;
  is_active: boolean;
  sort_order: number;
};
type LedgerRow = {
  kind: string;
  service: string | null;
  tokens: number;
  balance_after: number;
  revenue_thb: number | null;
  reason: string | null;
  created_at: string;
};

const nf = (n: number) => new Intl.NumberFormat("th-TH").format(n);

export default function AdminTokensPage() {
  const supabase = createSupabaseBrowserClient();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<Rate[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [saving, setSaving] = useState("");

  // grant form
  const [grantProfile, setGrantProfile] = useState("");
  const [grantTokens, setGrantTokens] = useState("");
  const [lookup, setLookup] = useState<{
    balance_tokens: number;
    lifetime_granted: number;
    lifetime_spent: number;
    ledger: LedgerRow[];
  } | null>(null);

  const authHeaders = useCallback(
    (t = token) => ({ "Content-Type": "application/json", Authorization: `Bearer ${t}` }),
    [token],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const t = sess.session?.access_token ?? "";
      setToken(t);
      if (!t) return;
      const [rRes, pRes] = await Promise.all([
        fetch("/api/admin/token-rates", { headers: authHeaders(t) }),
        fetch("/api/admin/token-packs", { headers: authHeaders(t) }),
      ]);
      if (rRes.ok) setRates((await rRes.json()).data.rates as Rate[]);
      if (pRes.ok) setPacks((await pRes.json()).data.packs as Pack[]);
    } finally {
      setLoading(false);
    }
  }, [supabase, authHeaders]);
  useEffect(() => {
    load();
  }, [load]);

  const saveRate = async (service: string, tokensPerUnit: number) => {
    setSaving(`rate:${service}`);
    try {
      const res = await fetch("/api/admin/token-rates", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ service, tokensPerUnit }),
      });
      if (!res.ok) {
        toast.error("บันทึก rate ไม่สำเร็จ");
        return;
      }
      toast.success("บันทึก rate แล้ว");
    } finally {
      setSaving("");
    }
  };

  const savePack = async (p: Pack) => {
    setSaving(`pack:${p.code}`);
    try {
      const res = await fetch("/api/admin/token-packs", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          code: p.code,
          name: p.name,
          price: p.price,
          tokens: p.tokens,
          bonusTokens: p.bonus_tokens,
          isActive: p.is_active,
          sortOrder: p.sort_order,
        }),
      });
      if (!res.ok) {
        toast.error("บันทึกแพ็กไม่สำเร็จ");
        return;
      }
      toast.success("บันทึกแพ็กแล้ว");
      await load();
    } finally {
      setSaving("");
    }
  };

  const doLookup = async () => {
    if (!grantProfile) return;
    const res = await fetch(`/api/admin/tokens?profileId=${encodeURIComponent(grantProfile)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      toast.error("ค้นหาไม่สำเร็จ");
      return;
    }
    setLookup((await res.json()).data);
  };

  const doGrant = async () => {
    const tk = Number(grantTokens);
    if (!grantProfile || !Number.isFinite(tk) || tk <= 0) {
      toast.error("กรอก profileId + จำนวน token");
      return;
    }
    setSaving("grant");
    try {
      const res = await fetch("/api/admin/tokens", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ profileId: grantProfile, tokens: tk, reason: "admin_grant" }),
      });
      if (!res.ok) {
        toast.error("เติมไม่สำเร็จ");
        return;
      }
      toast.success(`เติม ${nf(tk)} เครดิตแล้ว`);
      setGrantTokens("");
      await doLookup();
    } finally {
      setSaving("");
    }
  };

  return (
    <AdminPage
      title="การเงิน & บริการ"
      description="ตั้งอัตราแปลงหน่วย, แคตตาล็อกแพ็กเติม และเติมเครดิตให้ผู้ใช้"
      icon={<Coins className="h-6 w-6" />}
      tabs={<PaymentsTabs />}
    >
      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Rates */}
          <AdminCard title="อัตราแปลงหน่วย → token (1 บาท = 100 token)">
            <div className="grid gap-4 sm:grid-cols-3">
              {rates.map((r) => (
                <div key={r.service} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">
                    {r.service.toUpperCase()}{" "}
                    <span className="font-normal text-gray-400">/ {r.unit}</span>
                  </div>
                  <Label htmlFor={`rate-${r.service}`} className="mt-2">
                    token ต่อ 1 {r.unit === "page" ? "หน้า" : "วินาที"}
                  </Label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      id={`rate-${r.service}`}
                      type="number"
                      step="0.0001"
                      defaultValue={r.tokens_per_unit}
                      onChange={(e) => {
                        r.tokens_per_unit = Number(e.target.value);
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={saving === `rate:${r.service}`}
                      onClick={() => saveRate(r.service, r.tokens_per_unit)}
                    >
                      บันทึก
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    ≈{" "}
                    {r.unit === "page"
                      ? `${nf(r.tokens_per_unit)} เครดิต/หน้า`
                      : `${nf(Math.round(r.tokens_per_unit * 60))} เครดิต/นาที`}
                  </p>
                </div>
              ))}
            </div>
          </AdminCard>

          {/* Packs */}
          <AdminCard title="แคตตาล็อกแพ็กเติม">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>ชื่อ</TableHead>
                  <TableHead align="right">ราคา (฿)</TableHead>
                  <TableHead align="right">เครดิต</TableHead>
                  <TableHead align="right">โบนัส</TableHead>
                  <TableHead align="center">สถานะ</TableHead>
                  <TableHead align="right">บันทึก</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packs.length === 0 ? (
                  <TableEmpty colSpan={7}>ยังไม่มีแพ็ก</TableEmpty>
                ) : (
                  packs.map((p) => (
                    <TableRow key={p.code}>
                      <TableCell>{p.code}</TableCell>
                      <TableCell>
                        <Input
                          defaultValue={p.name}
                          onChange={(e) => {
                            p.name = e.target.value;
                          }}
                          className="w-32"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Input
                          type="number"
                          defaultValue={p.price}
                          onChange={(e) => {
                            p.price = Number(e.target.value);
                          }}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Input
                          type="number"
                          defaultValue={p.tokens}
                          onChange={(e) => {
                            p.tokens = Number(e.target.value);
                          }}
                          className="w-28"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Input
                          type="number"
                          defaultValue={p.bonus_tokens}
                          onChange={(e) => {
                            p.bonus_tokens = Number(e.target.value);
                          }}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <StatusBadge tone={p.is_active ? "success" : "neutral"}>
                          {p.is_active ? "เปิด" : "ปิด"}
                        </StatusBadge>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving === `pack:${p.code}`}
                            onClick={() => {
                              p.is_active = !p.is_active;
                              savePack(p);
                            }}
                          >
                            {p.is_active ? "ปิด" : "เปิด"}
                          </Button>
                          <Button
                            size="sm"
                            disabled={saving === `pack:${p.code}`}
                            onClick={() => savePack(p)}
                          >
                            บันทึก
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </AdminCard>

          {/* Grant */}
          <AdminCard title="เติมเครดิตให้ผู้ใช้ (manual / goodwill)">
            <div className="flex flex-wrap items-end gap-2">
              <div className="grow">
                <Label htmlFor="gp">Profile ID</Label>
                <Input
                  id="gp"
                  value={grantProfile}
                  onChange={(e) => setGrantProfile(e.target.value)}
                  placeholder="uuid ของผู้ใช้"
                  className="mt-1"
                />
              </div>
              <Button variant="outline" onClick={doLookup} disabled={!grantProfile}>
                ค้นหา
              </Button>
              <div className="w-40">
                <Label htmlFor="gt">จำนวนเครดิต</Label>
                <Input
                  id="gt"
                  type="number"
                  value={grantTokens}
                  onChange={(e) => setGrantTokens(e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button onClick={doGrant} disabled={saving === "grant"}>
                เติม
              </Button>
            </div>

            {lookup ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs text-gray-400">คงเหลือ</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {nf(lookup.balance_tokens)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs text-gray-400">เติมสะสม</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {nf(lookup.lifetime_granted)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs text-gray-400">ใช้สะสม</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {nf(lookup.lifetime_spent)}
                    </div>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>เวลา</TableHead>
                      <TableHead>ประเภท</TableHead>
                      <TableHead>บริการ</TableHead>
                      <TableHead align="right">token</TableHead>
                      <TableHead align="right">คงเหลือ</TableHead>
                      <TableHead align="right">รายได้ (฿)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lookup.ledger.length === 0 ? (
                      <TableEmpty colSpan={6}>ไม่มีรายการ</TableEmpty>
                    ) : (
                      lookup.ledger.map((l, i) => (
                        <TableRow key={i}>
                          <TableCell>{new Date(l.created_at).toLocaleString("th-TH")}</TableCell>
                          <TableCell>{l.kind}</TableCell>
                          <TableCell>{l.service ?? "—"}</TableCell>
                          <TableCell align="right" tabular>
                            {nf(l.tokens)}
                          </TableCell>
                          <TableCell align="right" tabular>
                            {nf(l.balance_after)}
                          </TableCell>
                          <TableCell align="right" tabular>
                            {l.revenue_thb != null ? Number(l.revenue_thb).toFixed(2) : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </AdminCard>
        </div>
      )}
    </AdminPage>
  );
}
