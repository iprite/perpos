"use client";

import { useParams } from "next/navigation";

import { useAuth } from "@/app/shared/auth-provider";
import { PoaRequestDetail } from "@/components/poa/poa-request-detail";

export default function PoaRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role, userId } = useAuth();
  return <PoaRequestDetail id={id} role={role} userId={userId} />;
}

