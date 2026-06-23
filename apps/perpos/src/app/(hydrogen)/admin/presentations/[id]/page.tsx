import { notFound } from "next/navigation";

import { requireSuperAdminPage } from "@/lib/admin/guard";
import { getDeck } from "@/lib/admin/presentations";
import { DeckWorkspace } from "./_workspace";

type Props = { params: Promise<{ id: string }> };

// Server Component — gate SSR + ดึง deck initial → ส่งให้ client workspace (hybrid)
export default async function DeckDetailPage({ params }: Props) {
  const admin = await requireSuperAdminPage();
  const { id } = await params;
  const deck = await getDeck(admin, id);
  if (!deck) notFound();

  return <DeckWorkspace initialDeck={deck} />;
}
