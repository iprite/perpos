import { requireSuperAdminPage } from "@/lib/admin/guard";
import { computeOrgHealth } from "@/lib/admin/health";
import { HealthView } from "./_view";

export default async function HealthPage() {
  const admin = await requireSuperAdminPage();
  const orgs = await computeOrgHealth(admin);

  return <HealthView initialOrgs={orgs} />;
}
