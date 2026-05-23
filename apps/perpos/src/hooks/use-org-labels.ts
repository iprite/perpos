"use client";

/**
 * useOrgLabels — returns a merged label map for the current org.
 *
 * Falls back to DEFAULT_LABELS for any key not overridden.
 * Caches the result for the org slug so it's only fetched once per session.
 *
 * Usage:
 *   const labels = useOrgLabels();
 *   const incomeLabel = labels['finance.income']; // 'ค่าเช่า' or 'รายรับ'
 */
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { DEFAULT_LABELS } from '@/lib/labels/defaults';

type LabelMap = Record<string, string>;

// Module-level cache: orgSlug → labels
const labelCache = new Map<string, LabelMap>();

export function useOrgLabels(orgId?: string | null): LabelMap {
  const [labels, setLabels] = useState<LabelMap>(DEFAULT_LABELS);

  const load = useCallback(async (id: string) => {
    // Return from cache if available
    if (labelCache.has(id)) {
      setLabels(labelCache.get(id)!);
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('org_label_overrides')
        .select('label_key, value')
        .eq('org_id', id)
        .eq('locale', 'th');

      if (error || !data) return;

      const merged: LabelMap = { ...DEFAULT_LABELS };
      for (const row of data) {
        const r = row as Record<string, string>;
        if (r.label_key && r.value) {
          merged[r.label_key] = r.value;
        }
      }

      labelCache.set(id, merged);
      setLabels(merged);
    } catch {
      // Silently fall back to defaults
    }
  }, []);

  useEffect(() => {
    if (orgId) load(orgId);
    else       setLabels(DEFAULT_LABELS);
  }, [orgId, load]);

  return labels;
}

/** Invalidate cached labels for an org (call after saving overrides) */
export function invalidateOrgLabels(orgId: string): void {
  labelCache.delete(orgId);
}
