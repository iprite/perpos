import { redirect } from "next/navigation";

/** ต้นทุน & กำไร ย้ายไปเป็นแท็บในแดชบอร์ดแล้ว — คงเส้นทางเดิมไว้กันลิงก์เก่าพัง */
export default async function TmcCostsRedirect({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/tmc?tab=costs`);
}
