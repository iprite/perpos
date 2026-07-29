"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { useOrgRole } from "@/app/shared/module-provider";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { Label } from "@/components/ui/label";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import {
  Navigation,
  Clock,
  User,
  Check,
  X,
  AlertCircle,
  Loader2,
  Sliders,
  DollarSign,
  CheckCircle2,
  XCircle,
  Settings,
  Fuel,
  ChevronRight,
  TrendingUp,
  Calendar,
} from "lucide-react";
import cn from "@core/utils/class-names";

interface Profile {
  id: string;
  display_name: string | null;
  email: string | null;
}

interface TravelHop {
  fromAddress: string;
  toAddress: string;
  distanceKm: number;
}

interface TravelClaim {
  id: string;
  work_date: string;
  hops: TravelHop[];
  total_distance_km: number | string;
  fuel_rate_per_km: number | string;
  total_amount: number | string;
  status: "pending" | "approved" | "paid" | "rejected";
  note: string | null;
  approved_at: string | null;
  created_at: string;
  profile: Profile | null;
  work_start_time?: string | null;
  work_end_time?: string | null;
  work_minutes?: number | null;
}

interface TravelSettings {
  fuel_rate_per_km: number | string;
  include_return: boolean;
  home_address?: string | null;
}

export default function TravelClaimsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const orgRole = useOrgRole();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // Page States
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data States
  const [claims, setClaims] = useState<TravelClaim[]>([]);
  const [settings, setSettings] = useState<TravelSettings | null>(null);
  const [fuelRate, setFuelRate] = useState<string>("4.00");

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [monthFilter, setMonthFilter] = useState<string>(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  });

  // Gating
  useEffect(() => {
    if (orgRole !== null && orgRole !== "owner" && orgRole !== "admin") {
      router.replace(`/${orgSlug}/just-me/clock-in-out`);
    }
  }, [orgRole, orgSlug, router]);

  // Load Data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Get Org ID from slug
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", orgSlug)
        .single();

      if (orgErr || !org) throw new Error("ไม่พบข้อมูลองค์กร");

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");

      // 2. Fetch Settings
      const settingsRes = await fetch(`/api/just-me/travel/settings?orgId=${org.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (settingsRes.ok) {
        const sd = await settingsRes.json();
        if (sd.settings) {
          setSettings(sd.settings);
          setFuelRate(String(sd.settings.fuel_rate_per_km));
        }
      }

      // 3. Fetch Claims
      const claimsRes = await fetch(
        `/api/just-me/travel/claims?orgId=${org.id}&month=${monthFilter}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!claimsRes.ok) {
        const errJson = await claimsRes.json().catch(() => ({}));
        throw new Error(errJson.error || "เกิดข้อผิดพลาดในการโหลดรายการเบิกจ่าย");
      }
      const cd = await claimsRes.json();
      setClaims(cd.claims || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, orgSlug, monthFilter]);

  useEffect(() => {
    if (orgRole === "owner" || orgRole === "admin") {
      loadData();
    }
  }, [orgRole, loadData]);

  // Save Settings
  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      setError(null);
      setSuccess(null);

      const rateVal = parseFloat(fuelRate);
      if (isNaN(rateVal) || rateVal <= 0) {
        throw new Error("กรุณาระบุอัตราค่าน้ำมันให้ถูกต้อง (มากกว่า 0)");
      }

      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", orgSlug)
        .single();
      if (!org) throw new Error("ไม่พบข้อมูลองค์กร");

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/just-me/travel/settings?orgId=${org.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fuel_rate_per_km: rateVal,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "ไม่สามารถบันทึกการตั้งค่าได้");
      }

      setSuccess("บันทึกอัตราค่าเดินทางต่อกิโลเมตรสำเร็จ");
      toast.success("บันทึกอัตราค่าเดินทางแล้ว");
      await loadData();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSavingSettings(false);
    }
  };

  // Update Claim Status
  const handleUpdateStatus = async (claimId: string, newStatus: string, claimNote?: string) => {
    try {
      setActionLoadingId(claimId);
      setError(null);
      setSuccess(null);

      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", orgSlug)
        .single();
      if (!org) throw new Error("ไม่พบข้อมูลองค์กร");

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/just-me/travel/claims?orgId=${org.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          claimId,
          status: newStatus,
          note: claimNote,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "ไม่สามารถอนุมัติรายการได้");
      }

      setSuccess(`อัปเดตสถานะรายการเป็น ${getStatusLabel(newStatus)} เรียบร้อยแล้ว`);
      toast.success(`อัปเดตสถานะเป็น ${getStatusLabel(newStatus)} แล้ว`);
      await loadData();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message || "อัปเดตไม่สำเร็จ");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Formatting helpers
  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "Asia/Bangkok",
      });
    } catch {
      return "—";
    }
  };

  const fmtTime = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      const normalized = iso.includes(" ") && !iso.includes("T") ? iso.replace(" ", "T") : iso;
      const d = new Date(normalized);
      if (isNaN(d.getTime())) return "—";
      return (
        d.toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Bangkok",
        }) + " น."
      );
    } catch {
      return "—";
    }
  };

  const fmtWorkMinutes = (mins: number | null | undefined) => {
    if (mins == null) return "—";
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    if (hrs === 0) return `${m} นาที`;
    return `${hrs} ชม. ${m} นาที`;
  };

  const getStatusLabel = (s: string) => {
    switch (s) {
      case "pending":
        return "รอการอนุมัติ";
      case "approved":
        return "อนุมัติแล้ว";
      case "paid":
        return "จ่ายเงินแล้ว";
      case "rejected":
        return "ปฏิเสธ";
      default:
        return s;
    }
  };

  // Filtered Claims
  const filteredClaims = useMemo(() => {
    return claims.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      return true;
    });
  }, [claims, statusFilter]);

  // Statistics for Current Month
  const stats = useMemo(() => {
    let totalKm = 0;
    let totalCash = 0;
    let pendingCount = 0;
    claims.forEach((c) => {
      totalKm += Number(c.total_distance_km || 0);
      totalCash += Number(c.total_amount || 0);
      if (c.status === "pending") pendingCount++;
    });
    return { totalKm, totalCash, pendingCount };
  }, [claims]);

  // แบ่งหน้าเฉพาะรายการที่แสดง — สรุปเดือน (stats) ยังคิดจาก claims ทั้งเดือน
  const claimsPager = usePagination(filteredClaims, {
    resetKey: `${statusFilter}|${monthFilter}`,
  });

  if (orgRole === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (orgRole !== "owner" && orgRole !== "admin") {
    return null; // Handled by redirect
  }

  return (
    <PageShell
      width="full"
      icon={<Navigation className="h-6 w-6" />}
      title="จัดการค่าเดินทางและเวลาทำงานพนักงาน"
      description="อนุมัติคำขอเบิกค่าเดินทาง ค่าน้ำมัน และตรวจเช็คเวลางานถอดจาก GPS"
    >
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        {/* Left column: Stats, rate settings */}
        <div className="space-y-6 xl:col-span-1">
          {/* Settings Card */}
          <div className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
              <Settings className="h-4 w-4 text-slate-500" />
              ตั้งค่าอัตราการจ่ายเงิน
            </h2>
            <div className="space-y-1.5">
              <Label htmlFor="fuel-rate">ค่าเดินทางคิดตามระยะทาง (บาทต่อ km)</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="fuel-rate"
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={fuelRate}
                    onChange={(e) => setFuelRate(e.target.value)}
                    className="border-slate-200 bg-slate-50 pl-9 font-semibold"
                  />
                </div>
                <Button
                  onClick={handleSaveSettings}
                  disabled={savingSettings || loading}
                  className="shrink-0 bg-violet-600 hover:bg-violet-700"
                >
                  {savingSettings ? "..." : "บันทึก"}
                </Button>
              </div>
              <p className="text-[11px] leading-normal text-slate-400">
                * อัตรานี้จะมีผลโดยตรงกับรายการคำนวณค่าเดินทางใหม่ของพนักงานทุกคนหลังจากกดเซฟ
              </p>
            </div>
          </div>

          {/* Quick Monthly Stats Card */}
          <div className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
              <TrendingUp className="h-4 w-4 text-slate-500" />
              สรุปเดือนนี้ ({monthFilter})
            </h2>
            <div className="space-y-3.5">
              <div className="flex items-center justify-between border-b border-dashed py-1.5">
                <span className="text-xs text-slate-500">ระยะทางรวม</span>
                <span className="text-sm font-bold text-slate-800">
                  {stats.totalKm.toFixed(1)} km
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-dashed py-1.5">
                <span className="text-xs text-slate-500">ยอดเบิกค่าน้ำมันรวม</span>
                <span className="text-sm font-black text-violet-700">
                  ฿{stats.totalCash.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-slate-500">รายการรออนุมัติ</span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-bold",
                    stats.pendingCount > 0
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-slate-200 bg-slate-50 text-slate-400",
                  )}
                >
                  {stats.pendingCount} รายการ
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Filter & Claims List */}
        <div className="space-y-4 xl:col-span-3">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-end gap-4 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="w-full space-y-1.5 sm:w-44">
              <Label>เดือน</Label>
              <Input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="border-slate-200 bg-slate-50"
              />
            </div>
            <div className="w-full space-y-1.5 sm:w-48">
              <Label>สถานะคำขอ</Label>
              <CustomSelect
                value={statusFilter}
                onChange={(v) => setStatusFilter(v)}
                options={[
                  { value: "", label: "ทุกสถานะ" },
                  { value: "pending", label: "รออนุมัติ" },
                  { value: "approved", label: "อนุมัติแล้ว" },
                  { value: "paid", label: "จ่ายเงินแล้ว" },
                  { value: "rejected", label: "ปฏิเสธ" },
                ]}
              />
            </div>
          </div>

          {/* Claims List */}
          {loading && claims.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
            </div>
          ) : filteredClaims.length === 0 ? (
            <div className="space-y-2 rounded-2xl border bg-white p-12 text-center text-sm text-slate-400">
              <Navigation className="mx-auto h-8 w-8 text-slate-300" />
              <p>ไม่พบรายการคำขอเบิกค่าเดินทางในตัวกรองนี้</p>
            </div>
          ) : (
            <div className="space-y-4">
              {claimsPager.rows.map((claim) => {
                const totalKm = Number(claim.total_distance_km || 0);
                const fuelRate = Number(claim.fuel_rate_per_km || 0);
                const totalAmount = Number(claim.total_amount || 0);

                return (
                  <div
                    key={claim.id}
                    className="flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm md:flex-row"
                  >
                    {/* Left details panel: User and Date */}
                    <div className="flex flex-col justify-between gap-4 border-b bg-slate-50/50 p-5 md:w-64 md:border-b-0 md:border-r">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700">
                            <User className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-800">
                              {claim.profile?.display_name || "ไม่ระบุชื่อ"}
                            </p>
                            <p className="truncate text-[11px] text-slate-400">
                              {claim.profile?.email}
                            </p>
                          </div>
                        </div>
                        <div className="border-t border-slate-100 pt-2 text-xs">
                          <p className="text-slate-400">วันที่เดินทาง</p>
                          <p className="mt-0.5 text-sm font-bold text-slate-700">
                            {fmtDate(claim.work_date)}
                          </p>
                        </div>
                      </div>

                      <div>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                            claim.status === "pending" &&
                              "border-amber-200 bg-amber-50 text-amber-700",
                            claim.status === "approved" &&
                              "border-emerald-200 bg-emerald-50 text-emerald-700",
                            claim.status === "paid" && "border-blue-200 bg-blue-50 text-blue-700",
                            claim.status === "rejected" &&
                              "border-rose-200 bg-rose-50 text-rose-700",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              claim.status === "pending" && "bg-amber-400",
                              claim.status === "approved" && "bg-emerald-500",
                              claim.status === "paid" && "bg-blue-500",
                              claim.status === "rejected" && "bg-rose-500",
                            )}
                          />
                          {getStatusLabel(claim.status)}
                        </span>
                      </div>
                    </div>

                    {/* Middle details: Hours and Hops */}
                    <div className="flex-1 space-y-4 p-5">
                      {/* Work time extraction block */}
                      <div className="space-y-3 rounded-xl border bg-slate-50 p-3.5">
                        <div className="flex items-center gap-1.5 border-b pb-1.5 text-xs font-bold text-slate-700">
                          <Clock className="h-4 w-4 shrink-0 text-indigo-600" />
                          <span>เวลาทำงาน (ถอดจากประวัติเข้าหน้างาน)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-3">
                          <div>
                            <span className="text-slate-400">เข้างาน (Site แรก):</span>
                            <p className="mt-0.5 font-bold text-slate-700">
                              {fmtTime(claim.work_start_time)}
                            </p>
                          </div>
                          <div>
                            <span className="text-slate-400">ออกงาน (Site สุดท้าย):</span>
                            <p className="mt-0.5 font-bold text-slate-700">
                              {claim.work_end_time ? fmtTime(claim.work_end_time) : "ยังไม่ระบุ"}
                            </p>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <span className="font-medium text-slate-400">เวลารวมปฏิบัติงาน:</span>
                            <p className="mt-0.5 font-black text-indigo-600">
                              {fmtWorkMinutes(claim.work_minutes)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Travel Hops block */}
                      <div className="space-y-2">
                        <p className="flex items-center gap-1 text-xs font-bold text-slate-500">
                          <Navigation className="h-3.5 w-3.5 text-violet-500" />
                          <span>รายละเอียดเส้นทางการเดินทาง</span>
                        </p>
                        {Array.isArray(claim.hops) && claim.hops.length > 0 ? (
                          <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                            {claim.hops.map((hop, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-xs text-slate-600"
                              >
                                <ChevronRight className="h-3 w-3 shrink-0 text-violet-400" />
                                <span className="max-w-[150px] truncate md:max-w-xs">
                                  {hop.fromAddress}
                                </span>
                                <span className="shrink-0 text-slate-400">→</span>
                                <span className="max-w-[150px] truncate md:max-w-xs">
                                  {hop.toAddress}
                                </span>
                                <span className="ml-auto shrink-0 font-semibold text-violet-700">
                                  {Number(hop.distanceKm || 0)} km
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs italic text-slate-400">
                            ไม่มีข้อมูลจุดจอด / ล็อกการเดินทาง
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right details panel: Money and Actions */}
                    <div className="flex flex-col justify-between gap-4 border-t bg-slate-50/20 p-5 md:w-60 md:border-l md:border-t-0">
                      <div className="text-right">
                        <p className="text-xs text-slate-400">
                          คำนวณค่าน้ำมัน ({totalKm} km × {fuelRate} บาท)
                        </p>
                        <p className="mt-1 text-2xl font-black text-violet-700">
                          ฿{totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </p>
                        {claim.note && (
                          <p className="mt-2 rounded bg-slate-100 p-1.5 text-left text-[11px] italic text-slate-400">
                            💡 {claim.note}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="space-y-2">
                        {claim.status === "pending" && (
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleUpdateStatus(claim.id, "approved")}
                              disabled={actionLoadingId === claim.id}
                              className="h-9 flex-1 bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700"
                            >
                              อนุมัติ
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleUpdateStatus(claim.id, "rejected")}
                              disabled={actionLoadingId === claim.id}
                              className="h-9 border-rose-200 text-xs font-bold text-rose-700 hover:bg-rose-50"
                            >
                              ปฏิเสธ
                            </Button>
                          </div>
                        )}

                        {claim.status === "approved" && (
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleUpdateStatus(claim.id, "paid")}
                              disabled={actionLoadingId === claim.id}
                              className="h-9 flex-1 bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
                            >
                              จ่ายเงินแล้ว
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleUpdateStatus(claim.id, "rejected")}
                              disabled={actionLoadingId === claim.id}
                              className="h-9 border-rose-200 text-xs font-bold text-rose-700 hover:bg-rose-50"
                            >
                              ปฏิเสธ
                            </Button>
                          </div>
                        )}

                        {claim.status === "paid" && (
                          <p className="rounded bg-slate-100 py-1.5 text-center text-xs font-bold text-slate-400">
                            ✅ ชำระเงินเรียบร้อย
                          </p>
                        )}

                        {claim.status === "rejected" && (
                          <Button
                            variant="outline"
                            onClick={() => handleUpdateStatus(claim.id, "pending")}
                            disabled={actionLoadingId === claim.id}
                            className="h-9 w-full border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                          >
                            ดึงกลับมาเป็นรออนุมัติ
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <TablePager pager={claimsPager} />
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
