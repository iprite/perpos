'use client';

/**
 * Shared shell ของร่ม "ผู้ช่วย AI" (assistant umbrella)
 *
 * ห่อทุกหน้า /assistant/* (ถอดเสียง · การใช้งาน · การชำระเงิน) ด้วยเปลือกเดียวกัน:
 *   - container + spacing มาตรฐาน
 *   - header (ไอคอน + ชื่อ + คำอธิบาย) ตามแท็บที่ active
 *   - แท็บนำทางสลับหน้า (เดิมไม่มี ผู้ใช้ต้องพึ่ง sidebar)
 *
 * เพิ่มหน้าใหม่ใต้ร่ม = เติม 1 entry ใน TABS (ดู docs/ASSISTANT.md §UI Shell)
 * NB: หน้าลูกไม่ต้องมี container/header ของตัวเอง — return เนื้อหาล้วน (<>...</>)
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mic, BarChart3, CreditCard } from 'lucide-react';
import { PageShell } from '@/components/ui/page-shell';

type Tab = {
  href: string;
  label: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
};

const TABS: Tab[] = [
  {
    href: '/assistant',
    label: 'ถอดเสียง',
    title: 'ถอดเสียงเป็นข้อความ',
    subtitle: 'อัปโหลดไฟล์เสียง/วิดีโอ ระบบจะถอดเป็นรายงานการประชุม (MoM) พร้อมแยกผู้พูด',
    icon: <Mic className="h-5 w-5" />,
  },
  {
    href: '/assistant/usage',
    label: 'การใช้งาน',
    title: 'การใช้งาน',
    subtitle: 'ภาพรวมการใช้โควต้าและสถิติการถอดเสียงของคุณ',
    icon: <BarChart3 className="h-5 w-5" />,
  },
  {
    href: '/assistant/billing',
    label: 'การชำระเงิน',
    title: 'การชำระเงิน',
    subtitle: 'จัดการแพ็กเกจรายเดือนและโควต้าการถอดเสียงของคุณ',
    icon: <CreditCard className="h-5 w-5" />,
  },
];

// แท็บที่ตรงที่สุด: '/assistant' ต้อง exact, ที่เหลือ match แบบ prefix
function activeTab(pathname: string): Tab {
  const sorted = [...TABS].sort((a, b) => b.href.length - a.href.length);
  return sorted.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`)) ?? TABS[0];
}

export default function AssistantLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = activeTab(pathname);

  return (
    <PageShell
      width="full"
      icon={current.icon}
      title={current.title}
      description={current.subtitle}
      tabs={
        <div className="flex gap-1 border-b border-gray-100">
          {TABS.map((t) => {
            const isActive = t.href === current.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:border-gray-200 hover:text-gray-700'
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      }
    >
      {children}
    </PageShell>
  );
}
