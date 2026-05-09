export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type NormalBalance = "debit" | "credit";

export type AccountRow = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  parentAccountId: string | null;
  description: string | null;
  isActive: boolean;
};

export const typeLabels: Record<AccountType, string> = {
  asset: "สินทรัพย์",
  liability: "หนี้สิน",
  equity: "ส่วนของเจ้าของ",
  income: "รายได้",
  expense: "ค่าใช้จ่าย",
};

export function defaultNormalBalance(t: AccountType): NormalBalance {
  return t === "asset" || t === "expense" ? "debit" : "credit";
}

export function formatType(t: AccountType) {
  return typeLabels[t] ?? t;
}

