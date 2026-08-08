"use client";

/**
 * แถบบริบทสำนักงานบัญชี — ขึ้นเหนือหน้าบัญชีเมื่อผู้ใช้เข้ามา "ในนามสำนักงาน"
 * (ไม่ได้เป็นสมาชิก org ลูกค้า) เพื่อให้รู้ตัวตลอดเวลาว่ากำลังแก้บัญชีของใคร
 *
 * ทำไมต้องมี: ผู้ใช้เข้าจากหน้าสำนักงานแล้ว URL เปลี่ยนเป็นของลูกค้า sidebar ก็เปลี่ยนตาม —
 * ถ้าไม่มีแถบนี้จะแยกไม่ออกว่ากำลังบันทึกลงบัญชีของสำนักงานเองหรือของลูกค้า (ลงผิดบริษัท
 * = ต้องกลับรายการ + งบเพี้ยนทั้งสองฝั่ง) · ปุ่มสลับลูกค้า/กลับสำนักงานอยู่ในแถบเดียวกัน
 * ผู้ใช้จึงไม่ต้องไปยุ่งกับ org switcher เลย
 */

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { StatusBadge } from "@/components/ui/badge";

export type FirmContextClient = { name: string; slug: string };

export function FirmContextBar({
  firmName,
  firmSlug,
  clientName,
  clientSlug,
  clients,
  readOnly = false,
}: {
  firmName: string;
  firmSlug: string;
  clientName: string;
  clientSlug: string;
  clients: FirmContextClient[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // สลับลูกค้าแล้วอยู่ "หน้าเดิม" = ระดับ section เท่านั้น (accounting/journal) —
  // **ห้ามลาก path ทั้งเส้นไปด้วย** เพราะ segment ที่ลึกกว่านั้นคือ id ของเอกสาร/รายการ
  // ซึ่งเป็นของ org เดิม ย้ายไปอีก org แล้ว 404 (หรือแย่กว่า: ชนกับ id ที่มีอยู่จริง)
  const swapClient = (slug: string) => {
    const [, , module = "accounting", section] = pathname.split("/");
    const target = [module, section].filter(Boolean).join("/");
    router.push(`/${slug}/${target}`);
  };

  const others = clients.filter((c) => c.slug !== clientSlug);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
      <Building2 className="h-4 w-4 shrink-0 text-gray-500" />
      <p className="min-w-0 text-sm text-gray-600">
        กำลังทำงานในนาม <span className="font-medium text-gray-900">{firmName}</span>
        <span className="mx-1.5 text-gray-400">›</span>
        <span className="font-medium text-gray-900">{clientName}</span>
      </p>

      {readOnly && (
        <StatusBadge tone="warning">
          <Eye className="me-1 h-3 w-3" />
          อ่านอย่างเดียว
        </StatusBadge>
      )}

      <div className="ms-auto flex items-center gap-2">
        {others.length > 0 && (
          <Dropdown
            label="สลับลูกค้า"
            leadingIcon={<Building2 className="h-4 w-4" />}
            placement="bottom-end"
            selectedKey={clientSlug}
            items={clients.map((c) => ({
              key: c.slug,
              label: c.name,
              icon: <Building2 className="h-4 w-4" />,
              onClick: () => swapClient(c.slug),
            }))}
          />
        )}
        <Button variant="outline" size="sm" onClick={() => router.push(`/${firmSlug}/acc-firm`)}>
          <ArrowLeft className="h-4 w-4" />
          กลับสำนักงาน
        </Button>
      </div>
    </div>
  );
}
