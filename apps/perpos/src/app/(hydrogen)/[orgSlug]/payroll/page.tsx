// payroll ถูกแทนที่ด้วยโมดูล HR (hrm) — redirect ทุกการเข้าหน้าเดิมไป /[orgSlug]/hrm
import { redirect } from "next/navigation";

export default async function PayrollRedirect({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/hrm`);
}
