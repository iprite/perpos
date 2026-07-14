/**
 * Prototype Registry — ทะเบียน prototype ทั้งหมดของ Module Factory
 *
 * โซน mock (ไม่ต่อ DB/API จริง) สำหรับ super_admin พรีเซน module ใหม่ก่อน build production.
 * เพิ่ม entry ใหม่ = append เข้า array นี้ (ตัวเดียวที่ index page อ่าน) — ดูหมายเหตุท้ายไฟล์.
 *
 * - key  = snake_case (ตรงกับ module key ใน specs/<module>.md)
 * - href = kebab-case route segment ใต้ /admin/prototypes/
 * - icon = lucide React node (ไฟล์เป็น .tsx เพราะมี JSX)
 */

import type { ReactNode } from "react";
import { HeartPulse, Hotel, LandPlot } from "lucide-react";

export type PrototypeEntry = {
  key: string;
  label: string;
  href: string;
  description: string;
  icon: ReactNode;
};

export const PROTOTYPE_REGISTRY: PrototypeEntry[] = [
  {
    key: "nursing_home",
    label: "ศูนย์ดูแลผู้สูงอายุ",
    href: "/admin/prototypes/nursing-home",
    description: "ระบบจัดการ nursing home ครบวงจร — ผู้พักอาศัย สุขภาพ/ยา เวร บิล + AI",
    icon: <HeartPulse className="h-5 w-5" />,
  },
  {
    key: "hotel",
    label: "โรงแรม",
    href: "/admin/prototypes/hotel",
    description:
      "ระบบจัดการโรงแรมเล็ก (PMS) — ปฏิทินจอง เช็คอิน-เอาท์ รับชำระ แม่บ้าน รายงานรายได้ + AI/LINE",
    icon: <Hotel className="h-5 w-5" />,
  },
  {
    key: "golf_club",
    label: "สนามกอล์ฟ & ไดร์ฟกอล์ฟ",
    href: "/admin/prototypes/golf-club",
    description:
      "ระบบจัดการสนามกอล์ฟ/ไดร์ฟ — ตารางจอง tee-time/bay เช็คอิน สมาชิก/แต้ม ราคา รายงาน + AI/LINE จองผ่าน LINE",
    icon: <LandPlot className="h-5 w-5" />,
  },
];
