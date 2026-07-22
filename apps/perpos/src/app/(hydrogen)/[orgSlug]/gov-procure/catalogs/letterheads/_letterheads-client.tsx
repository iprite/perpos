"use client";

// _letterheads-client.tsx — ค่าตั้งต้นหัวจดหมายต่อบริษัท (client view: เปิด Dialog แก้)
// รายชื่อบริษัทอ่านจาก COMPANIES (lib/gov-procure/types.ts) — ไม่ hardcode ซ้ำ

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileSignature, Pencil } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import type { Letterhead } from "@/lib/gov-procure/catalog";
import { COMPANIES } from "@/lib/gov-procure/types";
import { LetterheadDialog } from "../_components/letterhead-dialog";

export function LetterheadsClient({
  initialLetterheads,
  orgId,
  orgSlug,
  canManage,
}: {
  initialLetterheads: Letterhead[];
  orgId: string;
  orgSlug: string;
  /** owner/manager เท่านั้นที่แก้ได้ (server enforce ซ้ำ) */
  canManage: boolean;
}) {
  const [letterheads, setLetterheads] = useState<Letterhead[]>(initialLetterheads);
  const [editing, setEditing] = useState<string | null>(null);

  const byCompany = useMemo(() => {
    const map = new Map<string, Letterhead>();
    letterheads.forEach((l) => map.set(l.company, l));
    return map;
  }, [letterheads]);

  const current = editing ? (byCompany.get(editing) ?? null) : null;

  return (
    <PageShell
      width="default"
      icon={<FileSignature className="h-6 w-6" />}
      title="หัวจดหมายของบริษัท"
      description="ค่าตั้งต้นที่จะถูกคัดลอกเข้าชุดแคตตาล็อกใหม่ — ใช้พิมพ์หัวทุกหน้าของเอกสารแบบบรรยาย"
      actions={
        <Button variant="outline" asChild>
          <Link href={`/${orgSlug}/gov-procure/catalogs`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> กลับไปแคตตาล็อก
          </Link>
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <Text className="text-sm font-medium text-gray-900">
            ค่าตั้งต้นของบริษัท ≠ หัวจดหมายในชุด
          </Text>
          <Text className="mt-1 text-xs text-gray-600">
            ค่าที่ตั้งในหน้านี้จะถูก <span className="font-medium">คัดลอก</span> เข้าชุดแคตตาล็อก
            ตอนสร้างชุดใหม่หรือเปลี่ยนบริษัทของชุดเท่านั้น · ชุดที่สร้างไปแล้วถือสำเนาของตัวเอง
            (แก้ได้ที่ปุ่ม &quot;ตั้งค่าชุด&quot; ในห้องทำงาน) และจะไม่เปลี่ยนตามหน้านี้
          </Text>
          {!canManage && (
            <Text className="mt-2 text-xs text-gray-500">
              คุณมีสิทธิ์ดูอย่างเดียว — แก้ค่าตั้งต้นได้เฉพาะเจ้าของและผู้จัดการขององค์กร
            </Text>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {COMPANIES.map((company) => {
            const lh = byCompany.get(company);
            return (
              <div
                key={company}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Text className="text-sm font-semibold text-gray-900">{company}</Text>
                    <Text className="mt-0.5 text-xs text-gray-500">
                      {lh?.company_name ?? "ยังไม่ได้ตั้งชื่อที่จะพิมพ์บนเอกสาร"}
                    </Text>
                  </div>
                  <StatusBadge tone={lh ? "success" : "neutral"}>
                    {lh ? "ตั้งค่าแล้ว" : "ยังไม่ได้ตั้งค่า"}
                  </StatusBadge>
                </div>

                <div className="mt-3 space-y-0.5 text-xs text-gray-600">
                  {lh ? (
                    <>
                      {(lh.address_lines ?? []).slice(0, 3).map((line, i) => (
                        <div key={i} className="truncate">
                          {line}
                        </div>
                      ))}
                      {(lh.address_lines ?? []).length === 0 && (
                        <div className="text-gray-400">ยังไม่ได้กรอกที่อยู่</div>
                      )}
                      <div className="tabular-nums">
                        {lh.phone ? `โทร. ${lh.phone}` : "ไม่ระบุโทรศัพท์"}
                        {lh.tax_id ? ` · เลขผู้เสียภาษี ${lh.tax_id}` : ""}
                      </div>
                      <div className="text-gray-500">
                        {lh.logo_data_url ? "มีโลโก้แล้ว" : "ยังไม่มีโลโก้"}
                      </div>
                    </>
                  ) : (
                    <Text className="text-xs text-gray-500">
                      ยังไม่ได้ตั้งค่าหัวจดหมายของบริษัทนี้ —
                      ชุดใหม่ที่เลือกบริษัทนี้จะได้หัวจดหมายว่าง
                    </Text>
                  )}
                </div>

                <div className="mt-3 flex justify-end">
                  <Button
                    variant={lh ? "outline" : "default"}
                    size="sm"
                    disabled={!canManage}
                    onClick={() => setEditing(company)}
                  >
                    <Pencil className="mr-1.5 h-4 w-4" />
                    {lh ? "แก้ไข" : "ตั้งค่าหัวจดหมาย"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LetterheadDialog
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        company={editing}
        letterhead={current}
        orgId={orgId}
        canManage={canManage}
        onSaved={(next) =>
          setLetterheads((prev) => {
            const rest = prev.filter((l) => l.company !== next.company);
            return [...rest, next].sort((a, b) => a.company.localeCompare(b.company));
          })
        }
      />
    </PageShell>
  );
}
