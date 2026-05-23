"use client";

/**
 * <OrgLabel labelKey="finance.income" />
 *
 * Renders the org-specific label for a given key.
 * Falls back to DEFAULT_LABELS if no override is set.
 *
 * Requires an ancestor to provide orgId via OrgLabelContext.
 * Typically set once at the layout level.
 *
 * Usage:
 *   // 1. Wrap layout with provider (client boundary)
 *   <OrgLabelProvider orgId={activeOrg.id}>
 *     {children}
 *   </OrgLabelProvider>
 *
 *   // 2. Use anywhere inside
 *   <OrgLabel labelKey="finance.income" />
 *   // → renders "ค่าเช่า" (if TMC org) or "รายรับ" (default)
 *
 *   // 3. Or use the hook directly for logic
 *   const labels = useOrgLabelContext();
 *   const title = labels['sales.invoice'];
 */

import React, { createContext, useContext } from 'react';
import { useOrgLabels } from '@/hooks/use-org-labels';
import { DEFAULT_LABELS, getDefaultLabel } from '@/lib/labels/defaults';

// ── Context ────────────────────��─────────────────────���────────────────────────

type LabelContextValue = Record<string, string>;

const OrgLabelContext = createContext<LabelContextValue>(DEFAULT_LABELS);

export function OrgLabelProvider({
  orgId,
  children,
}: {
  orgId?: string | null;
  children: React.ReactNode;
}) {
  const labels = useOrgLabels(orgId);
  return (
    <OrgLabelContext.Provider value={labels}>
      {children}
    </OrgLabelContext.Provider>
  );
}

/** Access the full label map from context */
export function useOrgLabelContext(): LabelContextValue {
  return useContext(OrgLabelContext);
}

// ── Component ────────────────────���─────────────────────────────���──────────────

interface OrgLabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The label key, e.g. 'finance.income' */
  labelKey: string;
  /** Render as plain text (no wrapper span). Useful for aria-label / title attrs. */
  asText?: boolean;
}

export function OrgLabel({ labelKey, asText, ...props }: OrgLabelProps) {
  const labels = useContext(OrgLabelContext);
  const text   = labels[labelKey] ?? getDefaultLabel(labelKey);

  if (asText) return <>{text}</>;
  return <span {...props}>{text}</span>;
}
