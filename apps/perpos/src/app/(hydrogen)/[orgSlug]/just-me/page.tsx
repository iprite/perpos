'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useOrgRole } from '@/app/shared/module-provider';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { Input } from '@/components/ui/input';
import { Loader } from '@googlemaps/js-api-loader';
import {
  LayoutGrid, Loader2, AlertCircle, Users, Clock, LogIn, MapPin, Search, Navigation
} from 'lucide-react';
import cn from '@core/utils/class-names';

interface Profile {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface Member {
  user_id: string;
  role: string;
  profile: Profile | null;
}

interface Session {
  profile_id: string;
  org_id: string;
  status: 'pending_in' | 'pending_out' | 'clocked_in';
  last_in_time: string | null;
  last_in_latitude: number | null;
  last_in_longitude: number | null;
  last_in_address: string | null;
  updated_at: string;
  profile: Profile | null;
}

interface Log {
  id: string;
  profile_id: string;
  type: 'in' | 'out';
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  profile: Profile | null;
}

// Map Component
interface ClockMapProps {
  logs: Log[];
  sessions: Session[];
  focusLocation: { lat: number; lng: number } | null;
}

function ClockMap({ logs, sessions, focusLocation }: ClockMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      version: 'weekly',
    });

    loader.load().then((google) => {
      let latSum = 0;
      let lngSum = 0;
      let coordCount = 0;

      // Calculate center coordinates
      sessions.forEach((s) => {
        if (s.last_in_latitude && s.last_in_longitude) {
          latSum += Number(s.last_in_latitude);
          lngSum += Number(s.last_in_longitude);
          coordCount++;
        }
      });

      if (coordCount === 0) {
        logs.slice(0, 10).forEach((l) => {
          if (l.latitude && l.longitude) {
            latSum += Number(l.latitude);
            lngSum += Number(l.longitude);
            coordCount++;
          }
        });
      }

      const center =
        coordCount > 0
          ? { lat: latSum / coordCount, lng: lngSum / coordCount }
          : { lat: 13.736717, lng: 100.523186 }; // Thailand center

      const map = new google.maps.Map(mapRef.current!, {
        center,
        zoom: coordCount > 0 ? 12 : 6,
      });
      mapInstanceRef.current = map;

      const infoWindow = new google.maps.InfoWindow();
      const bounds = new google.maps.LatLngBounds();
      let hasPoints = false;

      const fmtDateTime = (iso: string) => {
        return new Date(iso).toLocaleString('th-TH', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Bangkok',
        }) + ' น.';
      };

      // Add green markers for active clocked-in employees
      sessions.forEach((s) => {
        if (s.last_in_latitude && s.last_in_longitude) {
          const pos = { lat: Number(s.last_in_latitude), lng: Number(s.last_in_longitude) };
          const marker = new google.maps.Marker({
            position: pos,
            map,
            title: `กำลังเข้างาน: ${s.profile?.display_name || 'พนักงาน'}`,
            icon: {
              url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
            },
          });

          marker.addListener('click', () => {
            infoWindow.setContent(`
              <div style="padding: 8px; font-family: sans-serif; font-size: 13px; line-height: 1.4;">
                <div style="font-weight: bold; font-size: 14px; color: #46BC9E; margin-bottom: 4px;">
                  🟢 ${s.profile?.display_name || 'ไม่ระบุชื่อ'}
                </div>
                <div style="color: #656D78; margin-bottom: 2px;">
                  <strong>บทบาท:</strong> กำลังเข้างาน (Clocked In)
                </div>
                <div style="color: #656D78; margin-bottom: 2px;">
                  <strong>เวลาเข้างาน:</strong> ${fmtDateTime(s.last_in_time || s.updated_at)}
                </div>
                <div style="color: #656D78; max-w-xs;">
                  <strong>สถานที่:</strong> ${s.last_in_address || 'ไม่ระบุที่อยู่'}
                </div>
              </div>
            `);
            infoWindow.open(map, marker);
          });

          bounds.extend(pos);
          hasPoints = true;
        }
      });

      // Add blue/red markers for recent clock logs
      logs.slice(0, 50).forEach((l) => {
        if (l.latitude && l.longitude) {
          const pos = { lat: Number(l.latitude), lng: Number(l.longitude) };
          const isIn = l.type === 'in';
          
          // Check if user has active session at same spot to prevent identical pin overlap
          const hasActiveSessionHere = sessions.some(
            (s) =>
              s.profile_id === l.profile_id &&
              s.last_in_latitude === l.latitude &&
              s.last_in_longitude === l.longitude
          );
          if (hasActiveSessionHere && isIn) return;

          const marker = new google.maps.Marker({
            position: pos,
            map,
            title: `${isIn ? 'เข้างาน' : 'ออกงาน'}: ${l.profile?.display_name || 'พนักงาน'}`,
            icon: {
              url: isIn
                ? 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                : 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
            },
          });

          marker.addListener('click', () => {
            infoWindow.setContent(`
              <div style="padding: 8px; font-family: sans-serif; font-size: 13px; line-height: 1.4;">
                <div style="font-weight: bold; font-size: 14px; color: ${isIn ? '#4DB0D3' : '#C43448'}; margin-bottom: 4px;">
                  ${isIn ? '🔵' : '🔴'} ${l.profile?.display_name || 'ไม่ระบุชื่อ'}
                </div>
                <div style="color: #656D78; margin-bottom: 2px;">
                  <strong>รายการ:</strong> ${isIn ? 'เข้างาน (Clock In)' : 'ออกงาน (Clock Out)'}
                </div>
                <div style="color: #656D78; margin-bottom: 2px;">
                  <strong>เวลา:</strong> ${fmtDateTime(l.timestamp)}
                </div>
                <div style="color: #656D78; max-w-xs;">
                  <strong>สถานที่:</strong> ${l.address || 'ไม่ระบุที่อยู่'}
                </div>
              </div>
            `);
            infoWindow.open(map, marker);
          });

          bounds.extend(pos);
          hasPoints = true;
        }
      });

      if (hasPoints && !focusLocation) {
        map.fitBounds(bounds);
        const listener = google.maps.event.addListener(map, 'idle', () => {
          if (map.getZoom()! > 16) map.setZoom(16);
          google.maps.event.removeListener(listener);
        });
      }
    }).catch(err => console.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, sessions]);

  useEffect(() => {
    if (mapInstanceRef.current && focusLocation) {
      mapInstanceRef.current.panTo(focusLocation);
      mapInstanceRef.current.setZoom(16);
    }
  }, [focusLocation]);

  return (
    <div className="relative w-full h-[450px] md:h-[500px] rounded-2xl overflow-hidden border shadow-inner bg-slate-50">
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
}

// Main Page Component
export default function JustMeDashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const orgRole = useOrgRole();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusLocation, setFocusLocation] = useState<{ lat: number; lng: number } | null>(null);

  // 1. Role verification & Gating
  useEffect(() => {
    if (orgRole !== null && orgRole !== 'owner' && orgRole !== 'admin') {
      router.replace(`/${orgSlug}/just-me/clock-in-out`);
    }
  }, [orgRole, orgSlug, router]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single();

      if (orgErr || !org) throw new Error('ไม่พบข้อมูลองค์กร');

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('กรุณาเข้าสู่ระบบใหม่');

      const res = await fetch(`/api/just-me/org-clock-logs?orgId=${org.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
      }

      const json = await res.json();
      setMembers(json.members || []);
      setSessions(json.sessions || []);
      setLogs(json.logs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, orgSlug]);

  useEffect(() => {
    if (orgRole === 'owner' || orgRole === 'admin') {
      loadData();
    }
  }, [orgRole, loadData]);

  // Helpers to calculate stats
  const activeCount = useMemo(() => sessions.length, [sessions]);
  const totalCount = useMemo(() => members.length, [members]);
  const inactiveCount = useMemo(() => Math.max(0, totalCount - activeCount), [totalCount, activeCount]);

  // Filter members list based on query
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const name = m.profile?.display_name || '';
      const email = m.profile?.email || '';
      return (
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [members, searchQuery]);

  // Find user current session status
  const getUserSession = (userId: string) => {
    return sessions.find((s) => s.profile_id === userId);
  };

  // Find user last historical log
  const getUserLastLog = (userId: string) => {
    return logs.find((l) => l.profile_id === userId);
  };

  // Get display role in Thai
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return 'เจ้าของบริษัท';
      case 'admin':
        return 'ผู้ดูแลระบบ';
      case 'team_lead':
        return 'หัวหน้าทีม';
      case 'team_member':
        return 'พนักงาน';
      default:
        return role;
    }
  };

  const getElapsedTime = (startTimeIso: string) => {
    const diffMs = Date.now() - new Date(startTimeIso).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    if (hrs === 0) return `${mins}น.`;
    return `${hrs}ชั่วโมง ${mins}น.`;
  };

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
      icon={<LayoutGrid className="h-6 w-6" />}
      title="Just Me Dashboard"
      description="รายงานสรุปการเข้า-ออกงาน และแผนที่พิกัดพนักงานทุกคน"
    >

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && members.length === 0 ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-white rounded-2xl border p-5 shadow-sm flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 shrink-0">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">พนักงานทั้งหมด</p>
                <p className="text-2xl font-black text-slate-800 mt-0.5">{totalCount} คน</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border p-5 shadow-sm flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 shrink-0">
                <LogIn className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">กำลังทำงาน</p>
                <p className="text-2xl font-black text-slate-800 mt-0.5">{activeCount} คน</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border p-5 shadow-sm flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-600 shrink-0">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">ไม่ได้ปฏิบัติงาน</p>
                <p className="text-2xl font-black text-slate-800 mt-0.5">{inactiveCount} คน</p>
              </div>
            </div>
          </div>

          {/* Main Dashboard Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left/Middle Column: Maps View */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-2xl border shadow-sm p-4 md:p-5 space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <Navigation className="h-5 w-5 text-indigo-500" />
                    แผนที่พิกัดลงเวลาล่าสุด
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" /> กำลังทำ
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-blue-500" /> เข้างานล่าสุด
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-red-500" /> ออกงานล่าสุด
                    </span>
                  </div>
                </div>

                <ClockMap logs={logs} sessions={sessions} focusLocation={focusLocation} />
              </div>
            </div>

            {/* Right Column: Employee List & Search */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4 flex flex-col h-[560px]">
                <div className="space-y-3">
                  <h2 className="text-base font-bold text-slate-800">รายชื่อและการลงเวลางาน</h2>
                  
                  {/* Custom Search Input */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="ค้นหาชื่อหรืออีเมลพนักงาน..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 bg-slate-50 border-slate-200"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pr-1">
                  {filteredMembers.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-400 space-y-1">
                      <Users className="h-8 w-8 mx-auto text-slate-300" />
                      <p>ไม่พบรายชื่อที่ค้นหา</p>
                    </div>
                  ) : (
                    filteredMembers.map((member) => {
                      const userSess = getUserSession(member.user_id);
                      const userLog = getUserLastLog(member.user_id);
                      const isActive = userSess?.status === 'clocked_in';

                      // Find coordinates to focus on
                      let lat: number | null = null;
                      let lng: number | null = null;
                      if (isActive) {
                        lat = userSess.last_in_latitude;
                        lng = userSess.last_in_longitude;
                      } else if (userLog) {
                        lat = userLog.latitude;
                        lng = userLog.longitude;
                      }

                      return (
                        <div key={member.user_id} className="py-3 flex items-start justify-between gap-3 hover:bg-slate-50/50 rounded-lg px-2 transition-colors">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-bold text-sm text-slate-800 truncate">
                                {member.profile?.display_name || 'ไม่ระบุชื่อ'}
                              </p>
                              <span className={cn(
                                "text-[10px] px-2 py-0.5 rounded-full font-medium border",
                                isActive 
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              )}>
                                {isActive ? '🟢 ทำงานอยู่' : '⚪ ออกงานแล้ว'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 truncate">{member.profile?.email}</p>
                            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                              <span>{getRoleLabel(member.role)}</span>
                              {isActive && userSess.last_in_time && (
                                <span className="font-medium text-emerald-600">
                                  ทำแล้ว {getElapsedTime(userSess.last_in_time)}
                                </span>
                              )}
                            </div>
                          </div>

                          {lat && lng && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="shrink-0 h-8 px-2.5 gap-1 text-[11px] font-bold border-indigo-150 hover:bg-indigo-50 hover:text-indigo-600 text-indigo-700 transition-all"
                              onClick={() => setFocusLocation({ lat, lng })}
                            >
                              <MapPin className="h-3.5 w-3.5" />
                              ดูหมุด
                            </Button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

          </div>

        </div>
      )}
    </PageShell>
  );
}
