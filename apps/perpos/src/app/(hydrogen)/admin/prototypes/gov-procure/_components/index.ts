// _components/index.ts — barrel shared foundation ของ prototype gov_procure
// หน้าต่าง ๆ import จากที่นี่: import { GovProcureShell, useRole, useData, fmtMoney } from "../_components";

export * from "./format";
export * from "./money";
export * from "./badges";
export * from "./role-context";
export * from "./data-context";
export { RoleSwitcher } from "./role-switcher";
export { GovProcureShell } from "./nav";
export { AiSummaryBox } from "./ai-summary-box";
export { NoAccess } from "./no-access";
export { OrderDialog } from "./order-dialog";
export { DetailDialog } from "./detail-dialog";
export { StageMoveDialog } from "./stage-move-dialog";
