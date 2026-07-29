import { redirect } from "next/navigation";

/** "รายงานรวม" ถูกยุบเข้าเป็นแท็บใน Dashboard แล้ว — คง URL เดิมไว้ให้ลิงก์เก่า */
export default async function AccFirmReportsRedirect({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/acc-firm`);
}
