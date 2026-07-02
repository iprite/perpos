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
import { Mic, BarChart3, CreditCard, Link2, Video } from 'lucide-react';
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
    label: 'การใช้งาน',
    title: 'การใช้งาน',
    subtitle: 'ภาพรวมการใช้โควต้าและสถิติการถอดเสียงของคุณ',
    icon: <BarChart3 className="h-5 w-5" />,
  },
  {
    href: '/assistant/stt',
    label: 'ถอดเสียง',
    title: 'ถอดเสียงเป็นข้อความ',
    subtitle: 'อัปโหลดไฟล์เสียง/วิดีโอ ระบบจะถอดเป็นรายงานการประชุม (MoM) พร้อมแยกผู้พูด',
    icon: <Mic className="h-5 w-5" />,
  },
  {
    href: '/assistant/meetings',
    label: 'ประชุม',
    title: 'ประชุม',
    subtitle: 'ประวัติบอทเข้าประชุม สถานะ และดาวน์โหลดรายงาน (MoM) / ไฟล์เสียง',
    icon: <Video className="h-5 w-5" />,
  },
  {
    href: '/assistant/calendar',
    label: 'เชื่อมต่อ Google',
    title: 'เชื่อมต่อ Google',
    subtitle: 'เชื่อม Google ครั้งเดียว — เตือนประชุมจากปฏิทิน + เก็บไฟล์ MoM/เสียงลง Drive อัตโนมัติ',
    icon: <Link2 className="h-5 w-5" />,
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
                    ? 'border-primary text-primary'
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
