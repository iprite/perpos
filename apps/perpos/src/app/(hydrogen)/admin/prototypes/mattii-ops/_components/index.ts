// _components/index.ts — barrel shared foundation ของ prototype mattii_ops
// หน้าต่าง ๆ import จากที่นี่: import { MattiiShell, useMattiiRole, useMattiiData, fmtMoney } from "../_components";

export * from "./format";
export * from "./detail-parts";
export * from "./money";
export * from "./badges";
export * from "./order-flow";
export * from "./stock-recipe";
export * from "./role-context";
export * from "./data-context";
export { RoleSwitcher } from "./role-switcher";
export { MattiiShell, MATTII_BASE } from "./nav";
export { NoAccess } from "./no-access";
