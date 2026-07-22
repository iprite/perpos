// index.ts — barrel export ของ fixtures ทั้งหมด (mattii_ops module)
export * from "./helpers";
export * from "./types";
export * from "./labels";
export * from "./staff";
export * from "./machines";
export * from "./materials";
export * from "./products";
export * from "./customers";
export * from "./conversations";
export * from "./orders";
export * from "./order-items";
export * from "./order-costs";
export * from "./design";
export * from "./print-jobs";
export * from "./qc";
export * from "./shipments";
export * from "./payments";
export * from "./stock-movements";
export * from "./integrations";
export * from "./activities";
export * from "./metrics";
export * from "./baseline";
export * from "./benchmarks";
export * from "./empty-states";
export * from "./ai-mocks";

// หมายเหตุ: line-mocks.ts จะเพิ่มโดย line-integration-designer แยกต่างหาก
// (data-seeder ไม่แตะไฟล์เหล่านี้ตามคำสั่ง CONTEXT.md)
