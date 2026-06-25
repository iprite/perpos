// payroll/reports → hrm (redirect — payroll ถูกแทนที่ด้วยโมดูล HR)
import { redirect } from "next/navigation";

export default async function PayrollReportsRedirect({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/hrm`);
}
