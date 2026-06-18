'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageShell, PageCard } from '@/components/ui/page-shell';
import { Loader2, AlertCircle } from 'lucide-react';

export default function HrmPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single();

      if (orgErr) throw new Error('ไม่พบข้อมูลองค์กร');

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('กรุณาเข้าสู่ระบบใหม่');

      const res = await fetch(`/api/hrm?orgId=${org.id}`, {
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
    <PageShell title="HR" description="โมดูลการจัดการทรัพยากรบุคคล">
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      ) : (
        <PageCard>
          <p className="text-center font-medium text-gray-600">เชื่อมต่อระบบโมดูล HR สำเร็จเรียบร้อยแล้ว!</p>
          <div className="mx-auto mt-4 max-w-md rounded-lg border bg-gray-50 p-4 text-left font-mono text-xs text-gray-500 space-y-1">
            <p>• Module Key: hrm</p>
            <p>• URL Path: /{orgSlug}/hrm</p>
            <p>• API Route: /api/hrm</p>
            <p>• Records loaded: {data.length} records</p>
          </div>
        </PageCard>
      )}
    </PageShell>
  );
}
