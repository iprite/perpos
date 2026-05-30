'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function useUsvillaBootstrap() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [orgId, setOrgId]       = useState('');
  const [token, setToken]       = useState('');
  const [bootError, setBootError] = useState('');

  useEffect(() => {
    async function run() {
      const { data: org } = await supabase
        .from('organizations').select('id').eq('slug', orgSlug).single();
      if (!org) { setBootError('ไม่พบข้อมูลองค์กร'); return; }
      const { data: sess } = await supabase.auth.getSession();
      const t = sess.session?.access_token;
      if (!t) { setBootError('กรุณาเข้าสู่ระบบใหม่'); return; }
      setOrgId(org.id);
      setToken(t);
    }
    run();
  }, [supabase, orgSlug]);

  return { orgId, token, bootError };
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function formatThaiDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: '2-digit',
  });
}
