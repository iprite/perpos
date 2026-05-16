export type ModuleDef = {
  key: string;
  label: string;
  href: string;
  match: (pathname: string) => boolean;
};

export const ALL_MODULES: ModuleDef[] = [
  {
    key: "accounting",
    label: "Accounting",
    href: "/executive-dashboard",
    match: (p) =>
      !p.startsWith("/payroll") &&
      !p.startsWith("/admin") &&
      !p.startsWith("/assistant"),
  },
  {
    key: "payroll",
    label: "Payroll",
    href: "/payroll/salary",
    match: (p) => p.startsWith("/payroll"),
  },
  {
    key: "assistant",
    label: "Assistant",
    href: "/assistant",
    match: (p) => p.startsWith("/assistant"),
  },
];

export const ALL_MODULE_KEYS = ALL_MODULES.map((m) => m.key);

export const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_MODULES.map((m) => [m.key, m.label]),
);

export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];
