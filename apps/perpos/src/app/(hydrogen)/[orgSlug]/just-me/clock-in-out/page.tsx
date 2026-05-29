'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Clock, LogIn, LogOut, MapPin, RefreshCw, Loader2, AlertCircle, Calendar
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
  status: 'pending_in' | 'pending_out' | 'clocked_in';
  last_in_time: string | null;
  last_in_latitude: number | null;
  last_in_longitude: number | null;
  last_in_address: string | null;
  updated_at: string;
}

export default function ClockInOutPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  
  const [logs, setLogs] = useState<ClockLog[]>([]);
  const [session, setSession] = useState<ClockSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
              
              {session && session.status === 'clocked_in' ? (
                <div className="space-y-4">
                  {/* Status Indicator */}
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

                  {/* Start details */}
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
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Out status */}
                  <div className="rounded-xl bg-slate-50 border p-5 text-center space-y-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                      ยังไม่เข้างาน (Clocked Out)
                    </span>
                    <p className="text-sm text-slate-400 leading-relaxed mt-2">
                      กรุณากดคำสั่ง **`/in`** ใน LINE Bot จากแชทของคุณ และกดยืนยันส่งพิกัดตำแหน่งเพื่อเริ่มบันทึกเข้างาน
                    </p>
                  </div>
                </div>
              )}

              {/* LINE Bot Info */}
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs text-indigo-800 leading-relaxed space-y-1">
                <p className="font-semibold">🤖 วิธีลงเวลาผ่าน LINE Bot:</p>
                <p>• พิมพ์ <strong>/in</strong> เพื่อลงเวลาเข้างาน</p>
                <p>• พิมพ์ <strong>/out</strong> เพื่อลงเวลาออกงาน</p>
                <p className="text-slate-400 pt-1 border-t mt-2">
                  * หมายเหตุ: ต้องทำการแชร์ตำแหน่งสถานที่ผ่าน LINE บอท เพื่อยืนยันพิกัดเข้า-ออกงาน
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Historical Logs */}
          <div className="lg:col-span-2 space-y-4">
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
