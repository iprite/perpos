import { notFound } from "next/navigation";
import React from "react";
import AgentDetailsView from "@/components/landing/agent-details-view";

const VALID_SLUGS = ["sales", "marketing", "procurement", "finance", "hr", "admin", "executive", "simulator"];

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function AgentPage({ params }: Props) {
  const { slug } = await params;

  if (!VALID_SLUGS.includes(slug)) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-white">
      <AgentDetailsView slug={slug} />
    </div>
  );
}

export async function generateStaticParams() {
  return VALID_SLUGS.map((slug) => ({ slug }));
}
