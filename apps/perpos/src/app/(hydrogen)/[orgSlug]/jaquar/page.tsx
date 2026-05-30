'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Loader2, AlertCircle } from 'lucide-react';

export default function JaquarPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. ดึงข้อมูล ID ขององค์กรจาก Slug URL
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single();

      if (orgErr) throw new Error('ไม่พบข้อมูลองค์กร');

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('กรุณาเข้าสู่ระบบใหม่');

      // 2. ดึงข้อมูลจาก API Route ของโมดูล
      const res = await fetch(`/api/jaquar?orgId=${org.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
      }

      const json = await res.json();
      setData(json.records || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, orgSlug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-indigo-500" />
            Jaquar
          </h1>
          <p className="text-sm text-slate-500">โมดูลการทำงานเฉพาะองค์กร (Jaquar)</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          {loading ? 'กำลังโหลด…' : 'รีเฟรช'}
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl border p-6 text-center space-y-4">
          <p className="text-slate-600 font-medium">เชื่อมต่อระบบโมดูล Jaquar สำเร็จเรียบร้อยแล้ว!</p>
          <div className="max-w-md mx-auto p-4 bg-slate-50 border rounded-lg text-left text-xs font-mono text-slate-500 space-y-1">
            <p>• Module Key: jaquar</p>
            <p>• URL Path: /{orgSlug}/jaquar</p>
            <p>• API Route: /api/jaquar</p>
            <p>• Records loaded: {data.length} records</p>
          </div>
        </div>
      )}
    </div>
  );
}
