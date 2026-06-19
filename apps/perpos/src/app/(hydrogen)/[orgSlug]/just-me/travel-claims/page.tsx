'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { useOrgRole } from '@/app/shared/module-provider';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { Input } from '@/components/ui/input';
import { CustomSelect } from '@/components/ui/custom-select';
import { Label } from '@/components/ui/label';
import {
  Navigation, Clock, User, Check, X, AlertCircle, Loader2,
  Sliders, DollarSign, CheckCircle2, XCircle, Settings, Fuel, ChevronRight,
  TrendingUp, Calendar
} from 'lucide-react';
import cn from '@core/utils/class-names';

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
  status: 'pending' | 'approved' | 'paid' | 'rejected';
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
  const [fuelRate, setFuelRate] = useState<string>('4.00');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [monthFilter, setMonthFilter] = useState<string>(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  });

  // Gating
  useEffect(() => {
    if (orgRole !== null && orgRole !== 'owner' && orgRole !== 'admin') {
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
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single();

      if (orgErr || !org) throw new Error('ไม่พบข้อมูลองค์กร');

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('กรุณาเข้าสู่ระบบใหม่');

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
        }
      );
      if (!claimsRes.ok) {
        const errJson = await claimsRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'เกิดข้อผิดพลาดในการโหลดรายการเบิกจ่าย');
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
    if (orgRole === 'owner' || orgRole === 'admin') {
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
        throw new Error('กรุณาระบุอัตราค่าน้ำมันให้ถูกต้อง (มากกว่า 0)');
      }

      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single();
      if (!org) throw new Error('ไม่พบข้อมูลองค์กร');

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/just-me/travel/settings?orgId=${org.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fuel_rate_per_km: rateVal,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
      }

      setSuccess('บันทึกอัตราค่าเดินทางต่อกิโลเมตรสำเร็จ');
      toast.success('บันทึกอัตราค่าเดินทางแล้ว');
      await loadData();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message || 'บันทึกไม่สำเร็จ');
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
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single();
      if (!org) throw new Error('ไม่พบข้อมูลองค์กร');

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/just-me/travel/claims?orgId=${org.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
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
        throw new Error(errJson.error || 'ไม่สามารถอนุมัติรายการได้');
      }

      setSuccess(`อัปเดตสถานะรายการเป็น ${getStatusLabel(newStatus)} เรียบร้อยแล้ว`);
      toast.success(`อัปเดตสถานะเป็น ${getStatusLabel(newStatus)} แล้ว`);
      await loadData();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message || 'อัปเดตไม่สำเร็จ');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Formatting helpers
  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Bangkok',
      });
    } catch {
      return '—';
    }
  };

  const fmtTime = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      const normalized = iso.includes(' ') && !iso.includes('T') ? iso.replace(' ', 'T') : iso;
      const d = new Date(normalized);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok',
      }) + ' น.';
    } catch {
      return '—';
    }
  };

  const fmtWorkMinutes = (mins: number | null | undefined) => {
    if (mins == null) return '—';
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    if (hrs === 0) return `${m} นาที`;
    return `${hrs} ชม. ${m} นาที`;
  };

  const getStatusLabel = (s: string) => {
    switch (s) {
      case 'pending': return 'รอการอนุมัติ';
      case 'approved': return 'อนุมัติแล้ว';
      case 'paid': return 'จ่ายเงินแล้ว';
      case 'rejected': return 'ปฏิเสธ';
      default: return s;
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
      if (c.status === 'pending') pendingCount++;
    });
    return { totalKm, totalCash, pendingCount };
  }, [claims]);

  if (orgRole === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (orgRole !== 'owner' && orgRole !== 'admin') {
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
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left column: Stats, rate settings */}
        <div className="xl:col-span-1 space-y-6">
          
          {/* Settings Card */}
          <div className="bg-white rounded-2xl border p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
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
                    className="pl-9 bg-slate-50 border-slate-200 font-semibold"
                  />
                </div>
                <Button 
                  onClick={handleSaveSettings} 
                  disabled={savingSettings || loading}
                  className="bg-violet-600 hover:bg-violet-700 shrink-0"
                >
                  {savingSettings ? '...' : 'บันทึก'}
                </Button>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                * อัตรานี้จะมีผลโดยตรงกับรายการคำนวณค่าเดินทางใหม่ของพนักงานทุกคนหลังจากกดเซฟ
              </p>
            </div>
          </div>

          {/* Quick Monthly Stats Card */}
          <div className="bg-white rounded-2xl border p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-slate-500" />
              สรุปเดือนนี้ ({monthFilter})
            </h2>
            <div className="space-y-3.5">
              <div className="flex items-center justify-between py-1.5 border-b border-dashed">
                <span className="text-xs text-slate-500">ระยะทางรวม</span>
                <span className="text-sm font-bold text-slate-800">{stats.totalKm.toFixed(1)} km</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-dashed">
                <span className="text-xs text-slate-500">ยอดเบิกค่าน้ำมันรวม</span>
                <span className="text-sm font-black text-violet-700">฿{stats.totalCash.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-slate-500">รายการรออนุมัติ</span>
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-bold border",
                  stats.pendingCount > 0 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-400 border-slate-200"
                )}>
                  {stats.pendingCount} รายการ
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Right column: Filter & Claims List */}
        <div className="xl:col-span-3 space-y-4">
          
          {/* Filters Bar */}
          <div className="bg-white rounded-2xl border p-4 shadow-sm flex flex-wrap gap-4 items-end">
            <div className="w-full sm:w-44 space-y-1.5">
              <Label>เดือน</Label>
              <Input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="bg-slate-50 border-slate-200"
              />
            </div>
            <div className="w-full sm:w-48 space-y-1.5">
              <Label>สถานะคำขอ</Label>
              <CustomSelect
                value={statusFilter}
                onChange={(v) => setStatusFilter(v)}
                options={[
                  { value: '', label: 'ทุกสถานะ' },
                  { value: 'pending', label: 'รออนุมัติ' },
                  { value: 'approved', label: 'อนุมัติแล้ว' },
                  { value: 'paid', label: 'จ่ายเงินแล้ว' },
                  { value: 'rejected', label: 'ปฏิเสธ' },
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
            <div className="bg-white rounded-2xl border p-12 text-center text-sm text-slate-400 space-y-2">
              <Navigation className="h-8 w-8 text-slate-300 mx-auto" />
              <p>ไม่พบรายการคำขอเบิกค่าเดินทางในตัวกรองนี้</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredClaims.map((claim) => {
                const totalKm = Number(claim.total_distance_km || 0);
                const fuelRate = Number(claim.fuel_rate_per_km || 0);
                const totalAmount = Number(claim.total_amount || 0);

                return (
                  <div key={claim.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col md:flex-row">
                    {/* Left details panel: User and Date */}
                    <div className="p-5 md:w-64 border-b md:border-b-0 md:border-r bg-slate-50/50 flex flex-col justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-bold shrink-0">
                            <User className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-slate-800 truncate">
                              {claim.profile?.display_name || 'ไม่ระบุชื่อ'}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">{claim.profile?.email}</p>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-slate-100 text-xs">
                          <p className="text-slate-400">วันที่เดินทาง</p>
                          <p className="text-sm font-bold text-slate-700 mt-0.5">{fmtDate(claim.work_date)}</p>
                        </div>
                      </div>

                      <div>
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border',
                          claim.status === 'pending' && 'bg-amber-50 text-amber-700 border-amber-200',
                          claim.status === 'approved' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                          claim.status === 'paid' && 'bg-blue-50 text-blue-700 border-blue-200',
                          claim.status === 'rejected' && 'bg-rose-50 text-rose-700 border-rose-200',
                        )}>
                          <span className={cn(
                            'h-1.5 w-1.5 rounded-full shrink-0',
                            claim.status === 'pending' && 'bg-amber-400',
                            claim.status === 'approved' && 'bg-emerald-500',
                            claim.status === 'paid' && 'bg-blue-500',
                            claim.status === 'rejected' && 'bg-rose-500',
                          )} />
                          {getStatusLabel(claim.status)}
                        </span>
                      </div>
                    </div>

                    {/* Middle details: Hours and Hops */}
                    <div className="p-5 flex-1 space-y-4">
                      {/* Work time extraction block */}
                      <div className="rounded-xl bg-slate-50 border p-3.5 space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 border-b pb-1.5">
                          <Clock className="h-4 w-4 text-indigo-600 shrink-0" />
                          <span>เวลาทำงาน (ถอดจากประวัติเข้าหน้างาน)</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400">เข้างาน (Site แรก):</span>
                            <p className="text-slate-700 font-bold mt-0.5">{fmtTime(claim.work_start_time)}</p>
                          </div>
                          <div>
                            <span className="text-slate-400">ออกงาน (Site สุดท้าย):</span>
                            <p className="text-slate-700 font-bold mt-0.5">
                              {claim.work_end_time ? fmtTime(claim.work_end_time) : 'ยังไม่ระบุ'}
                            </p>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <span className="text-slate-400 font-medium">เวลารวมปฏิบัติงาน:</span>
                            <p className="text-indigo-600 font-black mt-0.5">{fmtWorkMinutes(claim.work_minutes)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Travel Hops block */}
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-500 flex items-center gap-1">
                          <Navigation className="h-3.5 w-3.5 text-violet-500" />
                          <span>รายละเอียดเส้นทางการเดินทาง</span>
                        </p>
                        {Array.isArray(claim.hops) && claim.hops.length > 0 ? (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                            {claim.hops.map((hop, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                                <ChevronRight className="h-3 w-3 text-violet-400 shrink-0" />
                                <span className="truncate max-w-[150px] md:max-w-xs">{hop.fromAddress}</span>
                                <span className="text-slate-400 shrink-0">→</span>
                                <span className="truncate max-w-[150px] md:max-w-xs">{hop.toAddress}</span>
                                <span className="ml-auto font-semibold text-violet-700 shrink-0">{Number(hop.distanceKm || 0)} km</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">ไม่มีข้อมูลจุดจอด / ล็อกการเดินทาง</p>
                        )}
                      </div>
                    </div>

                    {/* Right details panel: Money and Actions */}
                    <div className="p-5 md:w-60 border-t md:border-t-0 md:border-l flex flex-col justify-between gap-4 bg-slate-50/20">
                      <div className="text-right">
                        <p className="text-xs text-slate-400">คำนวณค่าน้ำมัน ({totalKm} km × {fuelRate} บาท)</p>
                        <p className="text-2xl font-black text-violet-700 mt-1">
                          ฿{totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </p>
                        {claim.note && (
                          <p className="text-[11px] text-slate-400 mt-2 bg-slate-100 p-1.5 rounded text-left italic">
                            💡 {claim.note}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="space-y-2">
                        {claim.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleUpdateStatus(claim.id, 'approved')}
                              disabled={actionLoadingId === claim.id}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 font-bold"
                            >
                              อนุมัติ
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleUpdateStatus(claim.id, 'rejected')}
                              disabled={actionLoadingId === claim.id}
                              className="border-rose-200 hover:bg-rose-50 text-rose-700 text-xs h-9 font-bold"
                            >
                              ปฏิเสธ
                            </Button>
                          </div>
                        )}

                        {claim.status === 'approved' && (
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleUpdateStatus(claim.id, 'paid')}
                              disabled={actionLoadingId === claim.id}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 font-bold"
                            >
                              จ่ายเงินแล้ว
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleUpdateStatus(claim.id, 'rejected')}
                              disabled={actionLoadingId === claim.id}
                              className="border-rose-200 hover:bg-rose-50 text-rose-700 text-xs h-9 font-bold"
                            >
                              ปฏิเสธ
                            </Button>
                          </div>
                        )}

                        {claim.status === 'paid' && (
                          <p className="text-xs text-center text-slate-400 font-bold bg-slate-100 py-1.5 rounded">
                            ✅ ชำระเงินเรียบร้อย
                          </p>
                        )}

                        {claim.status === 'rejected' && (
                          <Button
                            variant="outline"
                            onClick={() => handleUpdateStatus(claim.id, 'pending')}
                            disabled={actionLoadingId === claim.id}
                            className="w-full text-xs h-9 border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                          >
                            ดึงกลับมาเป็นรออนุมัติ
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </PageShell>
  );
}
