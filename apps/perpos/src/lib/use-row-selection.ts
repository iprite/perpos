"use client";

/**
 * useRowSelection — state เลือกหลายแถว (bulk actions) ที่ reuse ได้ทุก list
 *   const sel = useRowSelection();
 *   sel.toggle(id) · sel.toggleAll(allIds, on) · sel.isSelected(id) · sel.count · sel.clear()
 */

import { useCallback, useMemo, useState } from "react";

export function useRowSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[], on: boolean) => {
    setSelected(on ? new Set(ids) : new Set());
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return useMemo(
    () => ({
      selected,
      ids: Array.from(selected),
      count: selected.size,
      toggle,
      toggleAll,
      clear,
      isSelected,
    }),
    [selected, toggle, toggleAll, clear, isSelected],
  );
}
