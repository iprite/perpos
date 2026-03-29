export type Role = "admin" | "sale" | "operation" | "employer" | "representative";

export type NavKey = "orders" | "workers" | "poa-requests" | "customers" | "my-customers" | "my-workers";

export type NavItem = {
  key: NavKey;
  label: string;
  href: string;
  roles: Role[];
};

export const roles: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "sale", label: "Sale" },
  { value: "operation", label: "Operation" },
  { value: "employer", label: "Employer/Customer" },
  { value: "representative", label: "Representative" },
];

export const navItems: NavItem[] = [
  {
    key: "orders",
    label: "คำสั่งซื้อ",
    href: "/orders",
    roles: ["admin", "sale", "operation", "employer"],
  },
  {
    key: "workers",
    label: "แรงงาน",
    href: "/workers",
    roles: ["admin", "operation", "employer"],
  },
  {
    key: "poa-requests",
    label: "คำขอ POA",
    href: "/poa-requests",
    roles: ["admin", "operation", "employer", "representative"],
  },
  {
    key: "customers",
    label: "นายจ้าง/ลูกค้า",
    href: "/customers",
    roles: ["admin", "sale", "operation", "employer"],
  },
  {
    key: "my-customers",
    label: "นายจ้างของฉัน",
    href: "/my-customers",
    roles: ["representative"],
  },
  {
    key: "my-workers",
    label: "แรงงานของฉัน",
    href: "/my-workers",
    roles: ["representative"],
  },
];

export function navForRole(role: Role) {
  return navItems.filter((i) => i.roles.includes(role));
}

export function firstNavHref(role: Role) {
  const first = navForRole(role)[0];
  return first ? first.href : "/poa-requests";
}
