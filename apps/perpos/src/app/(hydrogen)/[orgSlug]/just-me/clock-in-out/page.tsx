'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Clock, LogIn, LogOut, MapPin, RefreshCw, Loader2, AlertCircle, Calendar,
  MessageSquare, Bot, Navigation, Fuel, ChevronRight, CheckCircle,
} from 'lucide-react';
import cn from '@core/utils/class-names';

interface ClockLog {
  id: string;
  type: 'in' | 'out';
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  profile: {
    id: string;
    display_name: string | null;
    email: string | null;
  } | null;
}

interface ClockSession {
  profile_id: string;
  org_id: string;
  status: 'pending_in' | 'pending_out' | 'clocked_in' | 'traveling' | 'working';
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
}

interface TravelSettings {
  fuel_rate_per_km: number;
  home_address: string | null;
  include_return: boolean;
}

export default function ClockInOutPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  
  const [logs, setLogs] = useState<ClockLog[]>([]);
  const [session, setSession] = useState<ClockSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [travelStops, setTravelStops] = useState<TravelStop[]>([]);
  const [travelClaim, setTravelClaim] = useState<TravelClaim | null>(null);
  const [travelSettings, setTravelSettings] = useState<TravelSettings | null>(null);

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

      // 2. Fetch Clock Logs & Session state
      const res = await fetch(`/api/just-me/clock-logs?orgId=${org.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
      }

      const json = await res.json();
      setLogs(json.logs || []);
      setSession(json.session || null);

      // Fetch today's travel data
      const travelRes = await fetch(`/api/just-me/travel/today?orgId=${org.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (travelRes.ok) {
        const td = await travelRes.json();
        setTravelStops(td.stops || []);
        setTravelClaim(td.claim || null);
        setTravelSettings(td.settings || null);
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
  const fmtTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Bangkok'
    }) + ' น.';
  };

  const fmtDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Bangkok'
    });
  };

  // Calculate elapsed time for clocked_in session
  const getElapsedText = (startTimeIso: string) => {
    const diffMs = Date.now() - new Date(startTimeIso).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    if (hrs === 0) return `${mins} นาที`;
    return `${hrs} ชม. ${mins} นาที`;
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Clock In/Out</h1>
            <p className="text-sm text-slate-500">บันทึกและตรวจสอบเวลาเข้า-ออกงานของคุณ</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          รีเฟรชข้อมูล
        </Button>
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

      {loading && logs.length === 0 ? (
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
                        ออกจาก: {(session as any).last_depart_address || '—'}
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
              ) : session && session.status === 'clocked_in' ? (
                // Legacy clock-in session
                <div className="space-y-4">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-center space-y-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 animate-pulse">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      กำลังทำงาน (Clocked In)
                    </span>
                    <p className="text-2xl font-black text-slate-800 tracking-tight">
                      {session.last_in_time ? fmtTime(session.last_in_time) : ''}
                    </p>
                    <p className="text-xs text-slate-400">
                      ทำงานไปแล้ว: {session.last_in_time ? getElapsedText(session.last_in_time) : ''}
                    </p>
                  </div>
                  <div className="text-xs space-y-3 text-slate-600 border-t pt-4">
                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">เริ่มวันที่</p>
                        <p className="text-slate-500">{session.last_in_time ? fmtDate(session.last_in_time) : ''}</p>
                      </div>
                    </div>
                    {session.last_in_address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">สถานที่เข้างาน</p>
                          <p className="text-slate-500 leading-normal">{session.last_in_address}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4 text-xs text-rose-800 leading-relaxed space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-rose-900">
                      <Bot className="h-4 w-4 text-rose-600 shrink-0" />
                      <span>บันทึกออกงานผ่าน LINE Bot</span>
                    </div>
                    <p className="text-slate-600 leading-normal">
                      พิมพ์ <code className="bg-rose-100 px-1 py-0.5 rounded font-mono font-bold text-rose-700">/out</code> เพื่อรับลิงก์ออกงาน
                    </p>
                  </div>
                </div>
              ) : (
                // No session
                <div className="space-y-4">
                  <div className="rounded-xl bg-slate-50 border p-5 text-center space-y-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                      ยังไม่ได้เริ่มงาน
                    </span>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      พิมพ์ <code className="bg-blue-100 px-1 py-0.5 rounded font-mono font-bold text-blue-700">/ck</code> เพื่อเริ่มบันทึกการเดินทาง หรือ <code className="bg-emerald-100 px-1 py-0.5 rounded font-mono font-bold text-emerald-700">/in</code> สำหรับเข้างานแบบปกติ
                    </p>
                  </div>
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs text-indigo-800 leading-relaxed space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                      <MessageSquare className="h-4 w-4 text-indigo-600 shrink-0" />
                      <span>คำสั่ง LINE Bot</span>
                    </div>
                    <p className="text-slate-600"><code className="bg-blue-100 px-1 rounded font-mono font-bold text-blue-700">/ck ชื่อสถานที่</code> — บันทึกการเดินทาง + ค่าน้ำมัน</p>
                    <p className="text-slate-600"><code className="bg-emerald-100 px-1 rounded font-mono font-bold text-emerald-700">/in</code> / <code className="bg-rose-100 px-1 rounded font-mono font-bold text-rose-700">/out</code> — เวลาเข้า-ออกงานแบบปกติ</p>
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

          {/* Right Column: Travel Summary + Historical Logs */}
          <div className="lg:col-span-2 space-y-4">

            {/* Today's Travel Summary */}
            {(travelStops.length > 0 || travelClaim) && (
              <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <div className="border-b px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-violet-600" />
                    <h2 className="text-sm font-semibold text-slate-700">ค่าเดินทางวันนี้</h2>
                  </div>
                  {travelClaim && (
                    <span className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      travelClaim.status === 'pending' && 'bg-amber-50 text-amber-700',
                      travelClaim.status === 'approved' && 'bg-emerald-50 text-emerald-700',
                      travelClaim.status === 'paid' && 'bg-blue-50 text-blue-700',
                      travelClaim.status === 'rejected' && 'bg-rose-50 text-rose-700',
                    )}>
                      {travelClaim.status === 'pending' && 'รอการอนุมัติ'}
                      {travelClaim.status === 'approved' && 'อนุมัติแล้ว'}
                      {travelClaim.status === 'paid' && 'จ่ายแล้ว'}
                      {travelClaim.status === 'rejected' && 'ปฏิเสธ'}
                    </span>
                  )}
                </div>

                <div className="p-5 space-y-4">
                  {/* Stops timeline */}
                  {travelStops.length > 0 && (
                    <div className="space-y-1">
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
                          <div className="pb-1">
                            <p className="text-xs font-semibold text-slate-700">
                              {stop.note || stop.address || 'ไม่ระบุสถานที่'}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {stop.stop_type === 'start' ? 'เริ่มงาน' : stop.stop_type === 'end' ? 'สิ้นสุดงาน' : 'จุดแวะ'}{' '}
                              · {fmtTime(stop.timestamp)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Claim summary */}
                  {travelClaim ? (
                    <div className="rounded-xl bg-violet-50 border border-violet-100 p-4 space-y-3">
                      {travelClaim.hops.length > 0 && (
                        <div className="space-y-1.5">
                          {travelClaim.hops.map((hop, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                              <ChevronRight className="h-3 w-3 text-violet-400 shrink-0" />
                              <span className="truncate">{hop.fromAddress}</span>
                              <span className="text-slate-400 shrink-0">→</span>
                              <span className="truncate">{hop.toAddress}</span>
                              <span className="ml-auto font-semibold text-violet-700 shrink-0">{hop.distanceKm} km</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="pt-3 border-t border-violet-200 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Fuel className="h-3.5 w-3.5 text-violet-500" />
                          <span>{travelClaim.total_distance_km} km × {travelClaim.fuel_rate_per_km} บาท/km</span>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-violet-700">
                            ฿{travelClaim.total_amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : travelStops.length > 0 ? (
                    <div className="rounded-xl bg-slate-50 border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1 text-slate-300" />
                      กำลังรอการออกงาน (Clock Out) เพื่อคำนวณค่าเดินทาง
                    </div>
                  ) : null}

                  {/* /arrive tip */}
                  <div className="rounded-lg bg-violet-50 border border-violet-100 p-3 text-xs text-violet-800 leading-relaxed">
                    <p className="font-semibold">💡 บันทึกจุดแวะระหว่างวัน</p>
                    <p className="text-slate-500 mt-0.5">
                      พิมพ์ <code className="bg-violet-100 px-1 rounded font-mono font-bold text-violet-700">/arrive ชื่อสถานที่</code> ใน LINE Bot เพื่อบันทึกการมาถึงแต่ละจุด ระบบจะคำนวณค่าเดินทางทุก hop อัตโนมัติเมื่อออกงาน
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* No travel data yet — show tip */}
            {travelStops.length === 0 && !travelClaim && (
              <div className="bg-white rounded-2xl border shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Navigation className="h-4 w-4 text-violet-500" />
                  <h2 className="text-sm font-semibold text-slate-700">การเบิกค่าเดินทาง</h2>
                </div>
                <div className="rounded-lg bg-violet-50 border border-violet-100 p-4 text-xs text-violet-800 leading-relaxed space-y-1.5">
                  <p className="font-semibold">📍 วิธีบันทึกการเดินทางวันนี้</p>
                  <p className="text-slate-600">1. <code className="bg-violet-100 px-1 rounded font-mono font-bold text-violet-700">/in</code> — ลงเวลาเข้างาน (บันทึกพิกัดจุดเริ่มต้น)</p>
                  <p className="text-slate-600">2. <code className="bg-violet-100 px-1 rounded font-mono font-bold text-violet-700">/arrive บริษัท ABC</code> — บันทึกการมาถึงแต่ละ site</p>
                  <p className="text-slate-600">3. <code className="bg-violet-100 px-1 rounded font-mono font-bold text-violet-700">/out</code> — ลงเวลาออกงาน → ระบบคำนวณค่าเดินทางทั้งหมดอัตโนมัติ</p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
              <div className="border-b px-5 py-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">ประวัติการลงเวลาล่าสุด</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500 font-medium">
                  {logs.length} รายการ
                </span>
              </div>

              {logs.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400 space-y-2">
                  <Clock className="h-8 w-8 text-slate-300 mx-auto" />
                  <p>ยังไม่มีประวัติการบันทึกเวลาเข้า-ออกงาน</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b text-xs text-slate-500 font-medium">
                      <tr>
                        <th className="text-left px-5 py-3">ประเภท</th>
                        <th className="text-left px-4 py-3">วันที่</th>
                        <th className="text-left px-4 py-3">เวลา</th>
                        <th className="text-left px-4 py-3">พิกัด / สถานที่</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.map((log) => {
                        const isIn = log.type === 'in';
                        return (
                          <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3.5">
                              <span className={cn(
                                "inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold",
                                isIn ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                              )}>
                                {isIn ? (
                                  <LogIn className="h-3 w-3" />
                                ) : (
                                  <LogOut className="h-3 w-3" />
                                )}
                                {isIn ? 'Clock In' : 'Clock Out'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-slate-700 font-medium">
                              {fmtDate(log.timestamp)}
                            </td>
                            <td className="px-4 py-3.5 font-bold text-slate-800">
                              {fmtTime(log.timestamp)}
                            </td>
                            <td className="px-4 py-3.5 text-xs text-slate-500 leading-normal max-w-xs">
                              {log.address ? (
                                <div className="space-y-1">
                                  <p className="font-semibold text-slate-700">{log.address}</p>
                                  {log.latitude && log.longitude && (
                                    <p className="text-slate-400 font-mono">({log.latitude.toFixed(6)}, {log.longitude.toFixed(6)})</p>
                                  )}
                                </div>
                              ) : log.latitude && log.longitude ? (
                                <code className="font-mono text-slate-400">({log.latitude.toFixed(6)}, {log.longitude.toFixed(6)})</code>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
