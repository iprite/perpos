/**
 * /assistant/billing — เติมเครดิต + เติมอัตโนมัติ (hybrid)
 *
 * SSR: guard + ดึง quota + autotopup config ตอน SSR → ส่ง initial ให้ BillingView
 * client (mutation: checkout/setup/autotopup + refresh) — ไม่มีช่วงขาวรอ fetch แรก
 */

import { Suspense } from "react";
import { requireAssistantPage } from "@/lib/assistant/page-guard";
import { getTokenSummary } from "@/lib/assistant/token-balance";
import { getAutotopupConfig } from "@/lib/assistant/autotopup";
import BillingView from "./billing-view";

export default async function TokenBillingPage() {
  const { admin, userId } = await requireAssistantPage();
  const [summary, auto] = await Promise.all([
    getTokenSummary(admin, userId),
    getAutotopupConfig(admin, userId),
  ]);
  const quota = {
    balance_tokens: summary.balance_tokens,
    balance_thb: summary.balance_thb,
    earliest_expiry: summary.earliest_expiry,
  };

  return (
    <Suspense>
      <BillingView initialQuota={quota} initialAuto={auto} />
    </Suspense>
  );
}
