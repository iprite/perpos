import { NextResponse } from "next/server";

/**
 * Deprecated base endpoint (เดิม scaffold อ้าง `hrm_records` stub ที่จะถูก drop ใน B5).
 * resource จริงย้ายไป /api/hrm/{employees,payroll,leave,time,settings,documents,dashboard}.
 * คงไฟล์ไว้เป็น 410 กัน caller เก่าเรียก base path แล้วเข้าใจผิด.
 */
export function GET() {
  return NextResponse.json(
    { error: "endpoint นี้ถูกยกเลิก — ใช้ /api/hrm/<resource> แทน" },
    { status: 410 },
  );
}
