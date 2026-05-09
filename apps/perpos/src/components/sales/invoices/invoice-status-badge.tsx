import React from "react";

import { Badge } from "@/components/ui/badge";

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";

export function InvoiceStatusBadge(props: { status: InvoiceStatus }) {
  const s = props.status;
  if (s === "paid") return <Badge variant="success">Paid</Badge>;
  if (s === "overdue") return <Badge variant="danger">Overdue</Badge>;
  if (s === "void") return <Badge variant="danger">Void</Badge>;
  if (s === "sent") return <Badge variant="secondary">Sent</Badge>;
  return <Badge variant="default">Draft</Badge>;
}

