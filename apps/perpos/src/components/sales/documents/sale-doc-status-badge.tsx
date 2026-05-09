import React from "react";

import { Badge } from "@/components/ui/badge";
import type { AnyDocStatus } from "./doc-type-config";

export function SaleDocStatusBadge({ status }: { status: AnyDocStatus }) {
  if (status === "issued")   return <Badge variant="secondary">ออกแล้ว</Badge>;
  if (status === "voided")   return <Badge variant="danger">ยกเลิก</Badge>;
  if (status === "accepted") return <Badge variant="success">ยอมรับ</Badge>;
  if (status === "rejected") return <Badge variant="danger">ปฏิเสธ</Badge>;
  if (status === "expired")  return <Badge variant="danger">หมดอายุ</Badge>;
  return <Badge variant="default">แบบร่าง</Badge>;
}
