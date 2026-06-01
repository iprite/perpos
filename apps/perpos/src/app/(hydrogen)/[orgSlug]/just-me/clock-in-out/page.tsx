'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Clock, MapPin, RefreshCw, Loader2, AlertCircle,
  MessageSquare, Navigation, Fuel, ChevronRight,
  ChevronDown, ChevronUp
} from 'lucide-react';
import cn from '@core/utils/class-names';

interface ClockSession {
  profile_id: string;
  org_id: string;
  status: 'traveling' | 'working';
  last_in_time: string | null;
  last_in_latitude: number | null;
  last_in_longitude: number | null;
  last_in_address: string | null;
  last_depart_time: string | null;
  last_depart_address: string | null;
  updated_at: string;
}

interface TravelStop {
  id: string;
  sequence: number;
  stop_type: 'start' | 'site' | 'end';
  timestamp: string;
  address: string | null;
  note: string | null;
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
  total_distance_km: number;
  fuel_rate_per_km: number;
  total_amount: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  work_start_time?: string | null;
  work_end_time?: string | null;
  work_minutes?: number | null;
  note?: string | null;
}

interface TravelSettings {
  fuel_rate_per_km: number;
  home_address: string | null;
  include_return: boolean;
}

export default function ClockInOutPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  
  const [session, setSession] = useState<ClockSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [travelStops, setTravelStops] = useState<TravelStop[]>([]);
  const [travelClaim, setTravelClaim] = useState<TravelClaim | null>(null);
  const [travelSettings, setTravelSettings] = useState<TravelSettings | null>(null);
  
  // History of all claims and expand state
  const [claimsHistory, setClaimsHistory] = useState<TravelClaim[]>([]);
  const [expandedClaimIds, setExpandedClaimIds] = useState<Record<string, boolean>>({});

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

      // 2. Fetch Session state (via the existing clock-logs endpoint which packs session)
      const res = await fetch(`/api/just-me/clock-logs?orgId=${org.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const json = await res.json();
        setSession(json.session || null);
      }

      // 3. Fetch today's travel data
      const travelRes = await fetch(`/api/just-me/travel/today?orgId=${org.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (travelRes.ok) {
        const td = await travelRes.json();
        setTravelStops(td.stops || []);
        setTravelClaim(td.claim || null);
        setTravelSettings(td.settings || null);
      }

      // 4. Fetch all travel claims history
      const claimsRes = await fetch(`/api/just-me/travel/claims?orgId=${org.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (claimsRes.ok) {
        const cd = await claimsRes.json();
        setClaimsHistory(cd.claims || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, orgSlug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Helpers to format Thai Date/Time
  const fmtTime = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      const normalized = iso.includes(' ') && !iso.includes('T') ? iso.replace(' ', 'T') : iso;
      const d = new Date(normalized);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Bangkok'
      }) + ' น.';
    } catch (e) {
      console.error('fmtTime error:', e);
      return '—';
    }
  };

  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      const normalized = iso.includes(' ') && !iso.includes('T') ? iso.replace(' ', 'T') : iso;
      const d = new Date(normalized);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Bangkok'
      });
    } catch (e) {
      console.error('fmtDate error:', e);
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

  // Toggle expanded details for a specific claim
  const toggleExpandClaim = (id: string) => {
    setExpandedClaimIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 md:p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Navigation className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-xl font-black tracking-tight">เวลาทำงานและการเดินทาง</h1>
            </div>
            <p className="text-sm text-indigo-200 pl-11">บันทึก GPS ทุกจุดแวะ — ระบบคำนวณค่าน้ำมันให้อัตโนมัติ</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-1.5 border-white/30 bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm shrink-0"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            รีเฟรช
          </Button>
        </div>

        {/* Command pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { cmd: '/ck home', label: 'ออกบ้าน / ถึงบ้าน', color: 'bg-blue-500/30 border-blue-300/30' },
            { cmd: '/ck site ชื่อ', label: 'ถึง / ออกจากหน้างาน', color: 'bg-violet-500/30 border-violet-300/30' },
          ].map(({ cmd, label, color }) => (
            <div key={cmd} className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${color}`}>
              <code className="font-mono font-bold text-white">{cmd}</code>
              <span className="text-white/70">— {label}</span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {loading && claimsHistory.length === 0 ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Active Session Panel */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl border p-5 shadow-sm space-y-5">
              <h2 className="text-sm font-semibold text-slate-700">สถานะปัจจุบัน</h2>
              
              {/* ─── Travel clock state machine ─── */}
              {session && (session.status === 'traveling' || session.status === 'working') ? (
                <div className="space-y-4">
                  {session.status === 'traveling' ? (
                    // กำลังเดินทาง
                    <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-center space-y-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 animate-pulse">
                        <Navigation className="h-3 w-3" />
                        กำลังเดินทาง
                      </span>
                      <p className="text-xs text-slate-500 mt-1">
                        ออกจาก: {session.last_depart_address || '—'}
                      </p>
                      <p className="text-xs text-slate-400 pt-1 border-t mt-1">
                        พิมพ์ <code className="bg-blue-100 px-1 rounded font-mono font-bold text-blue-700">/ck ชื่อสถานที่</code> เมื่อถึงปลายทาง
                      </p>
                    </div>
                  ) : (
                    // กำลังทำงานอยู่ที่ site
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-center space-y-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 animate-pulse">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        กำลังทำงาน
                      </span>
                      {session.last_in_time && (
                        <p className="text-2xl font-black text-slate-800">{fmtTime(session.last_in_time)}</p>
                      )}
                      {session.last_in_address && (
                        <p className="text-xs text-slate-500">📍 {session.last_in_address}</p>
                      )}
                      <p className="text-xs text-slate-400 pt-1 border-t mt-1">
                        พิมพ์ <code className="bg-amber-100 px-1 rounded font-mono font-bold text-amber-700">/ck</code> เมื่อจะออกเดินทาง
                      </p>
                    </div>
                  )}
                  <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4 text-xs space-y-1.5">
                    <p className="font-semibold text-violet-800">🚗 วิธีใช้ระบบค่าเดินทาง</p>
                    <p className="text-slate-600">พิมพ์ <code className="bg-violet-100 px-1 rounded font-mono font-bold text-violet-700">/ck ชื่อสถานที่</code> ใน LINE Bot ทุกครั้งที่ออก/ถึงจุดหมาย ระบบจะสลับ depart ↔ arrive อัตโนมัติ</p>
                  </div>
                </div>
              ) : (
                // No active session
                <div className="space-y-4">
                  <div className="rounded-xl bg-slate-50 border p-5 text-center space-y-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                      ยังไม่ได้เริ่มงาน
                    </span>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      พิมพ์ <code className="bg-blue-100 px-1 py-0.5 rounded font-mono font-bold text-blue-700">/ck home</code> ใน LINE Bot เพื่อเริ่มบันทึกการเดินทาง
                    </p>
                  </div>
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs text-indigo-800 leading-relaxed space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                      <MessageSquare className="h-4 w-4 text-indigo-600 shrink-0" />
                      <span>วิธีใช้คำสั่ง</span>
                    </div>
                    <p className="text-slate-600"><code className="bg-blue-100 px-1 rounded font-mono font-bold text-blue-700">/ck home</code> — ออกจากบ้าน / ถึงบ้าน</p>
                    <p className="text-slate-600"><code className="bg-violet-100 px-1 rounded font-mono font-bold text-violet-700">/ck site ชื่อ</code> — ถึงหน้างาน / ออกจากหน้างาน</p>
                  </div>
                </div>
              )}

              {/* Security info */}
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs text-indigo-800 leading-relaxed space-y-1">
                <p className="font-semibold">🔒 ความปลอดภัยตำแหน่งพิกัด:</p>
                <p>• ระบบดึงตำแหน่งจากเซนเซอร์ GPS ของสมาร์ทโฟนโดยตรง</p>
                <p>• ไม่อนุญาตให้เลื่อนระบุตำแหน่งด้วยแผนที่เพื่อความโปร่งใสและถูกต้อง</p>
                <p className="text-slate-400 pt-1 border-t mt-2">
                  * กรุณาเปิดสิทธิ์การเข้าถึงตำแหน่งพิกัด (Location Access) เมื่อระบบถาม
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Today's active travel stops + Claims History */}
          <div className="lg:col-span-2 space-y-6">

            {/* 1. Today's Active Stops Timeline */}
            {travelStops.length > 0 && (
              <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <div className="border-b px-5 py-4 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-indigo-600" />
                    <h2 className="text-sm font-bold text-slate-700">เส้นทางการเดินทางวันนี้</h2>
                  </div>
                  <span className="rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-0.5 text-xs font-semibold">
                    มี {travelStops.length} จุดแวะจอด
                  </span>
                </div>

                <div className="p-5 space-y-4">
                  <div className="space-y-1.5">
                    {travelStops.map((stop, i) => (
                      <div key={stop.id} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            'h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0',
                            stop.stop_type === 'start' && 'bg-emerald-500',
                            stop.stop_type === 'site' && 'bg-violet-500',
                            stop.stop_type === 'end' && 'bg-rose-500',
                          )}>
                            {i + 1}
                          </div>
                          {i < travelStops.length - 1 && (
                            <div className="w-0.5 h-5 bg-slate-200 mt-0.5" />
                          )}
                        </div>
                        <div className="pb-1 min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-700 truncate">
                            {stop.note || stop.address || 'ไม่ระบุสถานที่'}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {stop.stop_type === 'start' ? 'เริ่มงาน' : stop.stop_type === 'end' ? 'สิ้นสุดงาน' : 'จุดแวะ'}{' '}
                            · {fmtTime(stop.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {travelClaim ? (
                    <div className="pt-3 border-t flex items-center justify-between text-xs bg-indigo-50/30 -mx-5 -mb-5 p-5">
                      <div className="flex items-center gap-1 text-slate-500">
                        <Fuel className="h-4 w-4 text-indigo-500 shrink-0" />
                        <span className="font-semibold">{Number(travelClaim.total_distance_km || 0)} km × {Number(travelClaim.fuel_rate_per_km || 0)} บาท</span>
                      </div>
                      <p className="text-base font-black text-indigo-700">
                        ฿{Number(travelClaim.total_amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-slate-50 border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1 text-slate-300" />
                      กำลังรอการออกงาน (Clock Out) เพื่อคำนวณค่าเดินทางของวันนี้
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. Historical Claims list: "รายการการทำงาน" */}
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="border-b px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4.5 w-4.5 text-violet-600" />
                  <h2 className="text-sm font-bold text-slate-700">รายการการทำงาน</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500 font-medium">
                  ประวัติ {claimsHistory.length} รายการ
                </span>
              </div>

              {claimsHistory.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400 space-y-2">
                  <Navigation className="h-8 w-8 text-slate-300 mx-auto" />
                  <p>ยังไม่มีประวัติรายการการทำงานและการเดินทาง</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {claimsHistory.map((claim) => {
                    const isExpanded = expandedClaimIds[claim.id] || false;
                    const totalKm = Number(claim.total_distance_km || 0);
                    const fuelRate = Number(claim.fuel_rate_per_km || 0);
                    const totalAmount = Number(claim.total_amount || 0);

                    return (
                      <div key={claim.id} className="p-4 hover:bg-slate-50/20 transition-colors">
                        
                        {/* Compact row summary (always visible) */}
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="space-y-1">
                            <p className="font-bold text-sm text-slate-800">
                              {fmtDate(claim.work_date)}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Navigation className="h-3.5 w-3.5 text-slate-400" />
                                ระยะทาง: <strong className="text-slate-700">{totalKm} km</strong>
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                เวลาทำงาน: <strong className="text-slate-700">{fmtWorkMinutes(claim.work_minutes)}</strong>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {/* Status badge */}
                            <span className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                              claim.status === 'pending' && 'bg-amber-50 text-amber-700 border-amber-200',
                              claim.status === 'approved' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                              claim.status === 'paid' && 'bg-blue-50 text-blue-700 border-blue-200',
                              claim.status === 'rejected' && 'bg-rose-50 text-rose-700 border-rose-200',
                            )}>
                              {claim.status === 'pending' && 'รออนุมัติ'}
                              {claim.status === 'approved' && 'อนุมัติแล้ว'}
                              {claim.status === 'paid' && 'จ่ายเงินแล้ว'}
                              {claim.status === 'rejected' && 'ปฏิเสธ'}
                            </span>

                            {/* Expand button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5 text-xs text-indigo-600 font-bold hover:bg-indigo-50 border border-slate-100 gap-1"
                              onClick={() => toggleExpandClaim(claim.id)}
                            >
                              {isExpanded ? (
                                <>
                                  ซ่อนรายละเอียด
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </>
                              ) : (
                                <>
                                  ดูรายละเอียด
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </>
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Expandable Details Container */}
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-slate-100 space-y-4 animate-in fade-in slide-in-from-top-1 duration-150">
                            
                            {/* Hours breakdown */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-xl border">
                              <div>
                                <span className="text-slate-400">⏰ เข้างาน (Site แรก)</span>
                                <p className="font-bold text-slate-700 mt-0.5">{fmtTime(claim.work_start_time)}</p>
                              </div>
                              <div>
                                <span className="text-slate-400">⏰ ออกงาน (Site สุดท้าย)</span>
                                <p className="font-bold text-slate-700 mt-0.5">
                                  {claim.work_end_time ? fmtTime(claim.work_end_time) : 'ยังไม่ระบุ'}
                                </p>
                              </div>
                              <div>
                                <span className="text-slate-400">💵 ค่าน้ำมันเบิกจ่าย</span>
                                <p className="font-black text-indigo-700 mt-0.5">
                                  ฿{totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}{' '}
                                  <span className="font-normal text-[10px] text-slate-400">
                                    ({totalKm} km × {fuelRate} บ.)
                                  </span>
                                </p>
                              </div>
                            </div>

                            {/* Hops */}
                            {Array.isArray(claim.hops) && claim.hops.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                  เส้นทางการจอดรถ / Checkpoints
                                </p>
                                <div className="space-y-1">
                                  {claim.hops.map((hop, index) => (
                                    <div key={index} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                                      <ChevronRight className="h-3 w-3 text-violet-400 shrink-0" />
                                      <span className="truncate max-w-[150px] md:max-w-xs">{hop.fromAddress}</span>
                                      <span className="text-slate-400 shrink-0">→</span>
                                      <span className="truncate max-w-[150px] md:max-w-xs">{hop.toAddress}</span>
                                      <span className="ml-auto font-semibold text-violet-700 shrink-0">{Number(hop.distanceKm || 0)} km</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {claim.note && (
                              <div className="text-xs bg-amber-50 border border-amber-100 text-amber-800 p-2.5 rounded-lg italic">
                                💡 หมายเหตุจากผู้อนุมัติ: {claim.note}
                              </div>
                            )}

                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Instruction tooltip when no active travel today */}
            {travelStops.length === 0 && (
              <div className="bg-white rounded-2xl border shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Navigation className="h-4 w-4 text-violet-500" />
                  <h2 className="text-sm font-semibold text-slate-700">คำแนะนำการเริ่มต้นการเดินทางวันนี้</h2>
                </div>
                <div className="rounded-lg bg-violet-50 border border-violet-100 p-4 text-xs text-violet-800 leading-relaxed space-y-1.5">
                  <p className="font-semibold">📍 วิธีบันทึกการเดินทางวันนี้</p>
                  <p className="text-slate-600">1. <code className="bg-blue-100 px-1 rounded font-mono font-bold text-blue-700">/ck home</code> — ออกจากบ้าน (บันทึกพิกัดต้นทาง)</p>
                  <p className="text-slate-600">2. <code className="bg-violet-100 px-1 rounded font-mono font-bold text-violet-700">/ck site บริษัท ABC</code> — ถึงหน้างาน / ออกจากหน้างาน</p>
                  <p className="text-slate-600">3. <code className="bg-blue-100 px-1 rounded font-mono font-bold text-blue-700">/ck home</code> — ถึงบ้าน → ระบบคำนวณค่าเดินทางทั้งหมดอัตโนมัติ</p>
                </div>
              </div>
            )}

          </div>

        </div>
      )}
    </div>
  );
}
