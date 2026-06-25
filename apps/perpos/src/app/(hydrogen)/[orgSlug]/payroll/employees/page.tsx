// payroll/employees ถูกแทนที่ด้วย hrm/employees — redirect
import { redirect } from "next/navigation";

export default async function PayrollEmployeesRedirect({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/hrm/employees`);
}
