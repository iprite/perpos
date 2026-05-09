import React from "react";

import { Badge } from "@/components/ui/badge";
import type { AnyPurchaseDocStatus } from "./purchase-doc-type-config";

export function PurchaseDocStatusBadge({ status }: { status: AnyPurchaseDocStatus }) {
  if (status === "issued")    return <Badge variant="secondary">ออกแล้ว</Badge>;
  if (status === "voided")    return <Badge variant="danger">ยกเลิก</Badge>;
  if (status === "approved")  return <Badge variant="success">อนุมัติแล้ว</Badge>;
  if (status === "received")  return <Badge variant="success">รับสินค้าแล้ว</Badge>;
  if (status === "cancelled") return <Badge variant="danger">ยกเลิก PO</Badge>;
  return <Badge variant="default">แบบร่าง</Badge>;
}
