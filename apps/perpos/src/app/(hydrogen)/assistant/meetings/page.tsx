/**
 * /assistant/meetings — ประวัติบอทเข้าประชุม + ส่งบอท (hybrid)
 *
 * SSR: guard + ดึง bot quota + jobs + upcoming ตอน SSR → ส่ง initial ให้ MeetingsView
 * client (poll สถานะสดทุก 30 วิ + ส่งบอท/ดาวน์โหลด) — ไม่มีช่วงขาวรอ fetch แรก
 */

import { requireAssistantPage } from "@/lib/assistant/page-guard";
import { getMeetingsData } from "@/lib/assistant/meetings";
import MeetingsView from "./meetings-view";

export default async function AssistantMeetingsPage() {
  const { admin, userId } = await requireAssistantPage();
  const { botSeconds, jobs, upcoming } = await getMeetingsData(admin, userId);

  return (
    <MeetingsView initialBotSeconds={botSeconds} initialJobs={jobs} initialUpcoming={upcoming} />
  );
}
