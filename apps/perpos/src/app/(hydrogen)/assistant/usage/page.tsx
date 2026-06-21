/**
 * /assistant/usage — ภาพรวมการใช้งาน (SSR)
 *
 * display ล้วน → Server Component: guard + ดึง stats/quota ตอน SSR
 * แล้วส่ง initial ให้ UsageView (client, recharts) วาดผล — ไม่มี client fetch ตอน mount
 */

import { requireAssistantPage } from "@/lib/assistant/page-guard";
import { getAssistantStats } from "@/lib/assistant/stats";
import { getTokenSummary } from "@/lib/assistant/token-balance";
import UsageView from "./usage-view";

export default async function MyStatsPage() {
  const { admin, userId } = await requireAssistantPage();
  const [stats, quota] = await Promise.all([
    getAssistantStats(admin, userId),
    getTokenSummary(admin, userId),
  ]);

  return <UsageView stats={stats} quota={quota} />;
}
