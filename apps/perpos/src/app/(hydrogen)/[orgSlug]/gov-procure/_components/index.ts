// barrel — re-export ของใช้ร่วมในหน้า gov-procure (production)
export { GovProcureProvider, useData, useRole } from "./gov-provider";
export {
  isRealized,
  pipelineValue,
  pipelineByStage,
  profitSplit,
  receivables,
  receivableSummary,
  type Receivable,
  type StageSummary,
} from "./money";
export { TODAY_DATE, TODAY_ISO, fmtMoney, fmtMoneyShort, fmtNum, fmtDateTH } from "./format";
export { DEPARTMENT_SUGGESTIONS } from "./constants";
export { StageBadge, OverdueBadge, AgingBadge, CompanyBadge } from "./badges";
