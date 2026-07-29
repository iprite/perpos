import { redirect } from "next/navigation";

/** เมนู "ลูกค้าบริการ" ถูกยุบรวมเข้ากับทะเบียนลูกค้า (/acc-firm/clients) แล้ว — คง URL เดิมไว้ให้ลิงก์เก่า */
export default async function ServiceClientsRedirect({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/acc-firm/clients`);
}
