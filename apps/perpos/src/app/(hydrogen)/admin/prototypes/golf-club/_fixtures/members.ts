// members.ts — golf_members fixture (~40 คน, บริบทไทย)
// ครึ่งหนึ่งมี line_user_id (จาก LINE), ครึ่ง walk-in (ไม่มี line_user_id)
// anchor เป๊ะ (ผูก ai-mocks.ts / line-mocks.ts / bookings.ts):
//   gm-001 คุณสมชาย ใจดี      — member gold (LINE anchor, ยอด LINE mock ทั้งชุด)
//   gm-003 คุณธนกฤต วัฒนชัย    — member gold, no_show 0/24 (AI-2 riskLow)
//   gm-014 คุณวีรพงษ์ ศรีสมบัติ — guest, no_show 4/12 (AI-2 riskHigh)
//   gm-027 คุณสุกัญญา ทองใบ    — guest, no_show 1/8, มัดจำแล้ว (AI-2 riskMedium)
import type { GolfMember } from "./types";

const now = "2026-06-01T03:00:00.000Z";
const ORG = "org-golf-greenvalley";

interface MemberOpts {
  memberType?: GolfMember["member_type"];
  memberNo?: string | null;
  planId?: string | null;
  tier?: GolfMember["tier"];
  expiresAt?: string | null;
  points?: number;
  noShow?: number;
  status?: GolfMember["status"];
  lineId?: string | null;
  notes?: string | null;
}

function m(id: string, name: string, phone: string | null, opts: MemberOpts = {}): GolfMember {
  return {
    id,
    org_id: ORG,
    profile_id: opts.lineId ? `profile-${id}` : null,
    line_user_id: opts.lineId ?? null,
    display_name: name,
    full_name: name,
    phone,
    member_type: opts.memberType ?? "guest",
    member_no: opts.memberNo ?? null,
    membership_plan_id: opts.planId ?? null,
    membership_expires_at: opts.expiresAt ?? null,
    tier: opts.tier ?? "none",
    points_balance: opts.points ?? 0,
    status: opts.status ?? "active",
    no_show_count: opts.noShow ?? 0,
    notes: opts.notes ?? null,
    created_at: now,
    updated_at: now,
  };
}

export const golfMembers: GolfMember[] = [
  m("gm-001", "คุณสมชาย ใจดี", "081-234-5601", {
    memberType: "member",
    memberNo: "M-0001",
    planId: "plan-gold",
    tier: "gold",
    expiresAt: "2027-03-01",
    points: 1450,
    noShow: 0,
    lineId: "Uline_somchai01",
    notes: "สมาชิก Gold — anchor LINE mock ทั้งชุด (จองสนาม A 13 ก.ค. 07:30)",
  }),
  m("gm-002", "คุณประยุทธ์ สายบัว", "086-111-2202", { noShow: 1 }),
  m("gm-003", "คุณธนกฤต วัฒนชัย", "089-555-1003", {
    memberType: "member",
    memberNo: "M-0003",
    planId: "plan-gold",
    tier: "gold",
    expiresAt: "2026-11-20",
    points: 3200,
    noShow: 0,
    lineId: "Uline_thanakrit03",
    notes: "สมาชิก Gold — ออกรอบสม่ำเสมอ ไม่เคย no-show",
  }),
  m("gm-004", "คุณนภัสสร แสงทอง", "084-222-2004", {
    memberType: "member",
    memberNo: "M-0004",
    planId: "plan-silver",
    tier: "silver",
    expiresAt: "2027-01-10",
    points: 620,
  }),
  m("gm-005", "คุณอนุชา พงษ์พันธ์", "080-333-3005", { lineId: "Uline_anucha05" }),
  m("gm-006", "คุณกิตติศักดิ์ เจริญสุข", "081-444-4006", {
    memberType: "member",
    memberNo: "M-0006",
    planId: "plan-platinum",
    tier: "platinum",
    expiresAt: "2027-02-14",
    points: 5100,
  }),
  m("gm-007", "คุณพิมพ์ชนก รุ่งเรือง", "082-555-5007", {
    memberType: "member",
    memberNo: "M-0007",
    planId: "plan-silver",
    tier: "silver",
    expiresAt: "2026-12-25",
    points: 340,
    lineId: "Uline_pimchanok07",
  }),
  m("gm-008", "คุณสุรชัย มั่นคง", "083-666-6008", { noShow: 2, lineId: "Uline_surachai08" }),
  m("gm-009", "คุณวรรณา ทิพย์เนตร", "084-777-7009", { lineId: "Uline_wanna09" }),
  m("gm-010", "คุณธีรพงษ์ ศักดิ์สิทธิ์", "085-888-8010", {
    memberType: "member",
    memberNo: "M-0010",
    planId: "plan-gold",
    tier: "gold",
    expiresAt: "2026-09-05",
    points: 1890,
  }),
  m("gm-011", "คุณอรุณี แก้วมณี", "086-999-9011", { lineId: "Uline_arunee11" }),
  m("gm-012", "คุณปิยะ บุญมาก", "087-000-0012", { noShow: 1 }),
  m("gm-013", "คุณพิศมัย จันทร์เพ็ญ", "081-121-2013", {
    memberType: "vip",
    memberNo: "V-0013",
    tier: "none",
    points: 80,
    lineId: "Uline_pissamai13",
    notes: "ลูกค้า VIP ไม่ได้สมัครแพ็กเกจรายปี — ใช้ราคา catalog VIP ตรง (fallback)",
  }),
  m("gm-014", "คุณวีรพงษ์ ศรีสมบัติ", "086-777-1014", {
    noShow: 4,
    lineId: "Uline_weerapong14",
    notes: "ประวัติ no-show สูง (4/12) — จองผ่าน LINE บ่อยแต่มักไม่ยืนยัน/ไม่ชำระมัดจำ",
  }),
  m("gm-015", "คุณทวีศักดิ์ อินทร์แก้ว", "082-232-3015", { noShow: 1 }),
  m("gm-016", "คุณสุพัตรา ดวงจันทร์", "089-343-4016", {
    memberType: "member",
    memberNo: "M-0016",
    planId: "plan-silver",
    tier: "silver",
    expiresAt: "2027-04-18",
    points: 210,
    lineId: "Uline_supattra16",
  }),
  m("gm-017", "คุณณัฐพล ไกรสร", "080-454-5017", {}),
  m("gm-018", "คุณชัยวัฒน์ รัตนโกศล", "081-565-6018", {
    memberType: "member",
    memberNo: "M-0018",
    planId: "plan-gold",
    tier: "gold",
    expiresAt: "2026-04-30",
    points: 950,
    lineId: "Uline_chaiwat18",
    notes: "แพ็กเกจ Gold หมดอายุแล้ว (2026-04-30) — จองครั้งถัดไปใช้ราคา member fallback จนกว่าจะต่ออายุ",
  }),
  m("gm-019", "คุณเบญจวรรณ ศรีสุข", "082-676-7019", {}),
  m("gm-020", "คุณสมพงษ์ หาญกล้า", "083-787-8020", {
    noShow: 6,
    lineId: "Uline_somphong20",
    status: "blocked",
    notes: "บล็อกจากประวัติ no-show สะสม 6 ครั้ง — ต้องโทรยืนยันก่อนรับจองทุกครั้ง",
  }),
  m("gm-021", "คุณอภิสิทธิ์ เมืองแมน", "084-898-9021", {
    memberType: "member",
    memberNo: "M-0021",
    planId: "plan-gold",
    tier: "gold",
    expiresAt: "2026-10-12",
    points: 1120,
    lineId: "Uline_apisit21",
  }),
  m("gm-022", "คุณรัตนาภรณ์ ทองสุข", "085-909-0022", { lineId: "Uline_rattana22" }),
  m("gm-023", "คุณประภาส วิเชียร", "086-010-1023", { noShow: 2 }),
  m("gm-024", "คุณมาลี ศรีวิไล", "087-121-2024", { lineId: "Uline_malee24" }),
  m("gm-025", "คุณสมบัติ ไชยวงศ์", "088-232-3025", {
    memberType: "vip",
    memberNo: "V-0025",
    tier: "none",
    points: 40,
    lineId: "Uline_sombat25",
    notes: "VIP อีกราย — ยังไม่สมัครแพ็กเกจรายปี",
  }),
  m("gm-026", "คุณธนพล เกียรติศักดิ์", "089-343-4026", { lineId: "Uline_thanapon26" }),
  m("gm-027", "คุณสุกัญญา ทองใบ", "082-333-1027", {
    noShow: 1,
    notes: "จองผ่านเว็บและชำระมัดจำสม่ำเสมอ — ความเสี่ยง no-show ต่ำ",
  }),
  m("gm-028", "คุณวีระชัย โพธิ์ทอง", "080-454-5028", { noShow: 1, lineId: "Uline_weerachai28" }),
  m("gm-029", "คุณอำนวย สุขสันต์", "081-565-6029", {
    status: "inactive",
    notes: "ย้ายไปอยู่ต่างจังหวัด ไม่ได้มาเล่นนานกว่า 8 เดือน",
  }),
  m("gm-030", "คุณปรีชา ธนวัฒน์", "082-676-7030", {
    memberType: "member",
    memberNo: "M-0030",
    planId: "plan-platinum",
    tier: "platinum",
    expiresAt: "2027-05-20",
    points: 4300,
    lineId: "Uline_preecha30",
  }),
  m("gm-031", "คุณจิตรา ใจเย็น", "083-787-8031", { lineId: "Uline_jittra31" }),
  m("gm-032", "คุณสมเกียรติ พูลสวัสดิ์", "084-898-9032", {}),
  m("gm-033", "คุณนงลักษณ์ บุญเรือง", "085-909-0033", {
    memberType: "member",
    memberNo: "M-0033",
    planId: "plan-silver",
    tier: "silver",
    expiresAt: "2026-03-15",
    points: 150,
    lineId: "Uline_nonglak33",
    notes: "แพ็กเกจ Silver หมดอายุแล้ว — ยังไม่ต่ออายุ",
  }),
  m("gm-034", "คุณเอกชัย รุ่งโรจน์", "086-010-1034", { noShow: 1, lineId: "Uline_ekkachai34" }),
  m("gm-035", "คุณพรทิพย์ อ่อนละมัย", "087-121-2035", { lineId: "Uline_porntip35" }),
  m("gm-036", "คุณไพโรจน์ แก้วสว่าง", "088-232-3036", {
    noShow: 5,
    status: "blocked",
    notes: "บล็อกชั่วคราวจาก no-show 5 ครั้งในรอบ 2 เดือน",
  }),
  m("gm-037", "คุณสุดา มีสุข", "089-343-4037", { lineId: "Uline_suda37" }),
  m("gm-038", "คุณบุญชัย ศรีทอง", "080-454-5038", {}),
  m("gm-039", "คุณรุ่งนภา แสนสุข", "081-565-6039", { lineId: "Uline_rungnapa39" }),
  m("gm-040", "คุณวิชัย ตั้งมั่น", null, { notes: "ลูกค้า walk-in ไม่ได้ให้เบอร์โทร" }),
];
