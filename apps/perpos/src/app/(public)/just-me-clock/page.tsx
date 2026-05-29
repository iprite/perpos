'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

function ClockDirectContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<'in' | 'out' | null>(null);

  // Decode action type from token just for displaying UI header (non-secure UI only)
  useEffect(() => {
    if (!token) {
      setError('ไม่พบกุญแจยืนยันสิทธิ์ (Token Not Found) กรุณาสั่งลงเวลาใหม่ทาง LINE Bot');
      return;
    }
    try {
      const parts = token.split('.');
      if (parts[0]) {
        const payloadStr = atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadStr) as { type: 'in' | 'out' };
        setType(payload.type);
      }
    } catch {
      // Ignored: Server will validate securely
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
          if (!res.ok) {
            throw new Error(json.error || 'เกิดข้อผิดพลาดในการบันทึกเวลา');
          }

          setSuccess(json.message || 'บันทึกเวลาสำเร็จ');
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        let msg = 'ไม่สามารถดึงพิกัด GPS ของอุปกรณ์ได้';
        if (err.code === 1) {
          msg = 'กรุณาอนุญาตสิทธิ์เข้าถึงพิกัดตำแหน่ง (Location Access) ในเบราว์เซอร์เพื่อทำรายการ';
        } else if (err.code === 2) {
          msg = 'สัญญาณ GPS อุปกรณ์ของคุณไม่แม่นยำหรือค้นหาตำแหน่งไม่ได้';
        } else if (err.code === 3) {
          msg = 'การเชื่อมต่อสัญญาณ GPS หมดเวลา';
        }
        setError(msg);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const isIn = type === 'in';

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center text-center space-y-5 py-8">
        <div className="rounded-full bg-emerald-50 p-4 border border-emerald-100 animate-bounce">
          <CheckCircle2 className="h-16 w-16 text-emerald-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-800">ทำรายการสำเร็จ</h2>
          <p className="text-sm text-slate-500 font-medium px-4">{success}</p>
        </div>
        <p className="text-xs text-slate-400 pt-4 border-t w-full">
          คุณสามารถปิดหน้าต่างเบราว์เซอร์นี้และกลับไปยังแชท LINE ได้ทันที
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {/* Title */}
      <div className="text-center space-y-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600">
          <Clock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-black text-slate-800 tracking-tight">
          {type ? (isIn ? 'ลงเวลาเข้างาน (Clock In)' : 'ลงเวลาออกงาน (Clock Out)') : 'กำลังยืนยันตัวตน...'}
        </h1>
        <p className="text-xs text-slate-500 font-medium px-6">
          บันทึกเวลาด้วยตำแหน่งปัจจุบันของคุณ เพื่อความโปร่งใสและถูกต้องของพิกัด
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 leading-normal">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">เกิดข้อผิดพลาด</p>
            <p className="text-slate-500 font-medium">{error}</p>
          </div>
        </div>
      )}

      {type && (
        <div className="space-y-4 pt-2">
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 text-center text-xs text-slate-600 leading-relaxed">
            <p className="font-semibold text-slate-700">🔒 บันทึกด้วยระบบ GPS ปลอดภัย</p>
            <p className="text-slate-400 mt-1">
              ระบบล็อกพิกัดปัจจุบันจากอุปกรณ์ โดยคุณไม่ต้องลากหมุดแผนที่ด้วยตัวเอง
            </p>
          </div>

          <Button
            className={`w-full py-7 text-base font-black shadow-md rounded-xl gap-2 flex items-center justify-center text-white ${
              isIn
                ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                : 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
            }`}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <MapPin className="h-5 w-5" />
            )}
            {isIn ? '📍 กดเพื่อเข้างาน (Clock In)' : '📍 กดเพื่อออกงาน (Clock Out)'}
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
