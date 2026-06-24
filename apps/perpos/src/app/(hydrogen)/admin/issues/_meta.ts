import type { BadgeTone } from "@/components/ui/badge";
import type { IssueStatus, IssueType, IssueSeverity, IssueSource } from "@/lib/admin/issues";

export const STATUS_LABEL: Record<IssueStatus, string> = {
  open: "เปิดเรื่อง",
  triaging: "คัดแยก",
  diagnosing: "หาต้นเหตุ",
  fixing: "กำลังแก้",
  verifying: "กำลังตรวจ",
  fixed: "แก้แล้ว (รอ deploy)",
  deployed: "ขึ้น prod แล้ว",
  closed: "ปิดสมบูรณ์",
  blocked: "ติดบล็อก",
  wontfix: "ไม่แก้",
  duplicate: "ซ้ำ",
  handoff_feature: "ส่งต่อฟีเจอร์",
};

export const STATUS_TONE: Record<IssueStatus, BadgeTone> = {
  open: "neutral",
  triaging: "info",
  diagnosing: "info",
  fixing: "info",
  verifying: "info",
  fixed: "warning",
  deployed: "success",
  closed: "success",
  blocked: "warning",
  wontfix: "neutral",
  duplicate: "neutral",
  handoff_feature: "info",
};

export const TYPE_LABEL: Record<IssueType, string> = {
  bug: "บั๊ก",
  user_error: "ใช้งานผิด",
  config_infra: "ตั้งค่า/ระบบ",
  feature_gap: "ฟีเจอร์ขาด",
};

export const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  sev1: "วิกฤต (sev1)",
  sev2: "สำคัญ (sev2)",
  sev3: "เล็กน้อย (sev3)",
};

export const SEVERITY_TONE: Record<IssueSeverity, BadgeTone> = {
  sev1: "danger",
  sev2: "warning",
  sev3: "neutral",
};

export const SOURCE_LABEL: Record<IssueSource, string> = {
  admin: "แอดมิน",
  agent: "Agent",
  line: "LINE",
  signal: "สัญญาณระบบ",
};

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
