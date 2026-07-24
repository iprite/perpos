// page.tsx — ห้องถาม-ตอบของผู้ช่วยวิเคราะห์ธุรกิจ (`[orgSlug]/bi`)
// hybrid: server component ดึง initial (thread + ข้อความ + metric ที่ตอบได้) → client view ทำ mutation
// guard = getModuleRoleForCurrentUser('bi') · ข้อมูล `bi_*` ดึงผ่าน lib/bi เท่านั้น (ตาราง REVOKE จาก authenticated)

import Link from "next/link";
import { BookOpen, Sparkles } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { loadChatInitialData, requireBiPage } from "./_components/guard";
import { ChatClient } from "./_components/chat-client";

export default async function BiChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ thread?: string; q?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireBiPage(orgSlug);
  const data = await loadChatInitialData(ctx, sp.thread ?? null);

  return (
    <PageShell
      title="ผู้ช่วยวิเคราะห์ธุรกิจ"
      description="ถามข้อมูลธุรกิจเป็นภาษาไทย ได้คำตอบพร้อมกราฟ นิยาม และวิธีคำนวณ"
      icon={<Sparkles className="h-6 w-6" />}
      width="default"
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href={`/${orgSlug}/bi/metrics`}>
            <BookOpen className="mr-1.5 h-4 w-4" />
            ถามอะไรได้บ้าง
          </Link>
        </Button>
      }
    >
      <ChatClient
        orgId={ctx.orgId}
        orgSlug={orgSlug}
        canWrite={ctx.canWrite}
        threads={data.threads}
        activeThreadId={data.activeThreadId}
        messages={data.messages}
        metrics={data.metrics}
        initialQuestion={sp.q}
      />
    </PageShell>
  );
}
