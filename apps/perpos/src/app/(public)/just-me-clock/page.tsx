'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, CheckCircle2, AlertCircle, Clock, Navigation } from 'lucide-react';

type TokenType = 'depart' | 'arrive';
type LocType = 'home' | 'site' | null;

interface CfgEntry {
  headerTitle: string;
  headerSub: (note: string | null, loc: LocType) => string;
  infoText: (loc: LocType) => string;
  btnLabel: (note: string | null, loc: LocType) => string;
  btnColor: (loc: LocType) => string;
  iconBg: string;
  iconColor: string;
}

const CONFIG: Record<TokenType, CfgEntry> = {
  depart: {
    headerTitle: '🚗 บันทึกการออกเดินทาง',
    headerSub: (note, loc) => note ? `ออกจาก: ${note}` : loc === 'home' ? 'ออกจากบ้าน' : 'ออกจากหน้างาน',
    infoText: () => '📍 GPS ณ ตำแหน่งนี้จะเป็นจุดเริ่มต้นของ hop ถัดไป',
    btnLabel: (note, loc) => {
      if (note) return `📍 ออกจาก ${note}`;
      return loc === 'home' ? '🏠 ออกจากบ้าน (บันทึก GPS)' : '🚗 ออกจากหน้างาน (บันทึก GPS)';
    },
    btnColor: (loc) => loc === 'home'
      ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
      : 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700',
    iconBg: 'bg-blue-50 border-blue-100',
    iconColor: 'text-blue-600',
  },
  arrive: {
    headerTitle: '✅ บันทึกการมาถึง',
    headerSub: (note, loc) => note ? `ถึง: ${note}` : loc === 'home' ? 'ถึงบ้านแล้ว 🏠' : 'ถึงหน้างานแล้ว',
    infoText: (loc) => loc === 'home'
      ? '🏠 ระบบจะคำนวณ hop สุดท้ายและสรุปค่าเดินทางทั้งวัน'
      : '📍 ระบบคำนวณระยะทาง hop นี้และเริ่มจับเวลางาน',
    btnLabel: (note, loc) => {
      if (note) return `📍 บันทึกมาถึง ${note}`;
      return loc === 'home' ? '🏠 บันทึกถึงบ้าน (บันทึก GPS)' : '📍 บันทึกถึงหน้างาน (บันทึก GPS)';
    },
    btnColor: (loc) => loc === 'home'
      ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
      : 'bg-violet-600 hover:bg-violet-700 active:bg-violet-800',
    iconBg: 'bg-emerald-50 border-emerald-100',
    iconColor: 'text-emerald-600',
  },
};

function ClockDirectContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ message: string; hop?: { distanceKm: number; fromAddress: string; toAddress: string } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<TokenType | null>(null);
  const [locType, setLocType] = useState<LocType>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('ไม่พบกุญแจยืนยันสิทธิ์ (Token Not Found) กรุณาสั่งใหม่ทาง LINE Bot');
      return;
    }
    try {
      const parts = token.split('.');
      if (parts[0]) {
        let base64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
          base64 += '=';
        }
        const payloadStr = atob(base64);
        const payload = JSON.parse(payloadStr) as { type: TokenType; locationType?: LocType; note?: string | null };
        setType(payload.type);
        setLocType(payload.locationType ?? null);
        if (payload.note) setNote(payload.note);
      }
    } catch (e) {
      console.error('Failed to parse token client-side:', e);
      setError('โทเค็นการลงเวลามีรูปแบบไม่ถูกต้อง หรือลิงก์หมดอายุ กรุณาพิมพ์คำสั่งใหม่ทาง LINE Bot');
    }
  }, [token]);

  const handleConfirm = () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('เบราว์เซอร์ของคุณไม่สนับสนุน Geolocation');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch('/api/just-me/clock-direct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              latitude,
              longitude,
              address: `พิกัด GPS (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`,
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'เกิดข้อผิดพลาด');
          setSuccess({ message: json.message || 'บันทึกสำเร็จ', hop: json.hop ?? null });
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: 'กรุณาอนุญาตสิทธิ์เข้าถึงตำแหน่ง (Location Access) ในเบราว์เซอร์',
          2: 'สัญญาณ GPS ไม่แม่นยำหรือค้นหาตำแหน่งไม่ได้',
          3: 'การเชื่อมต่อ GPS หมดเวลา',
        };
        setError(msgs[err.code] || 'ไม่สามารถดึงพิกัด GPS ของอุปกรณ์ได้');
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const cfg = type ? CONFIG[type] : null;
  const resolvedBtnColor = cfg ? cfg.btnColor(locType) : '';

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center text-center space-y-5 py-8">
        <div className="rounded-full bg-emerald-50 p-4 border border-emerald-100 animate-bounce">
          <CheckCircle2 className="h-16 w-16 text-emerald-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-800">ทำรายการสำเร็จ</h2>
          <p className="text-sm text-slate-500 font-medium px-4">{success.message}</p>
        </div>
        {/* Show hop distance on arrival */}
        {success.hop && (
          <div className="w-full rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-left space-y-2">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold">
              <Navigation className="h-4 w-4" />
              <span>ระยะทาง hop นี้</span>
            </div>
            <p className="text-xs text-slate-500">{success.hop.fromAddress} → {success.hop.toAddress}</p>
            <p className="text-2xl font-black text-emerald-600">{success.hop.distanceKm} km</p>
          </div>
        )}
        <p className="text-xs text-slate-400 pt-4 border-t w-full">
          ปิดหน้าต่างเบราว์เซอร์นี้แล้วกลับไปยังแชท LINE
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      <div className="text-center space-y-2">
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border ${cfg?.iconBg ?? 'bg-slate-50 border-slate-100'} ${cfg?.iconColor ?? 'text-slate-400'}`}>
          {type === 'depart' ? <Navigation className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
        </div>
        <h1 className="text-xl font-black text-slate-800 tracking-tight">
          {cfg ? cfg.headerTitle : 'กำลังยืนยันตัวตน...'}
        </h1>
        {cfg && (
          <p className="text-sm font-semibold text-slate-600">{cfg.headerSub(note, locType)}</p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 leading-normal">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">เกิดข้อผิดพลาด</p>
            <p className="text-slate-500">{error}</p>
          </div>
        </div>
      )}

      {cfg && (
        <div className="space-y-4 pt-2">
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 text-center text-xs text-slate-600 leading-relaxed">
            <p className="text-slate-500">{cfg.infoText(locType)}</p>
          </div>

          <Button
            className={`w-full py-7 text-base font-black shadow-md rounded-xl gap-2 flex items-center justify-center text-white ${resolvedBtnColor}`}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />}
            {cfg.btnLabel(note, locType)}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ClockDirectPage() {
  return (
    <div className="mx-auto max-w-sm bg-white rounded-3xl border border-slate-100 shadow-xl p-6 md:p-8 mt-6">
      <Suspense fallback={
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
        </div>
      }>
        <ClockDirectContent />
      </Suspense>
    </div>
  );
}
