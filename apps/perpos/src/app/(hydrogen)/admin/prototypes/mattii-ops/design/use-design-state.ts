"use client";

// use-design-state.ts — state ของหน้า "งานแบบลาย & CF"
//
// ⚠️ ข้อมูลที่ "ข้ามหน้า" (งานแบบ / เวอร์ชันไฟล์ลาย / เวอร์ชันที่ลูกค้ายืนยัน) อยู่ใน data-context กลาง
// เท่านั้น (_components/data-context.tsx) — หน้านี้ห้ามเก็บ overlay ของตัวเองอีก มิฉะนั้นหน้า /production
// จะไม่เห็นผล CF ที่เพิ่งบันทึก (blocker B2) · สถานะออเดอร์เปลี่ยนผ่าน data-context + guard order-flow.ts เสมอ

import { useCallback, useMemo } from "react";
import { canAdvance, canSendBackToDesign, useMattiiData, useMattiiRole } from "../_components";
import { ORDER_STATUS_LABEL } from "../_fixtures/labels";
import type {
  MattiiCustomer,
  MattiiDesignJob,
  MattiiDesignVersion,
  MattiiOrder,
  MattiiStaff,
} from "../_fixtures/types";

export interface DesignJobView {
  job: MattiiDesignJob;
  order: MattiiOrder | undefined;
  customer: MattiiCustomer | undefined;
  designer: MattiiStaff | undefined;
  /** เวอร์ชันไฟล์ลายเรียง v1 → vN */
  versions: MattiiDesignVersion[];
  /** เวอร์ชันล่าสุด */
  latest: MattiiDesignVersion | undefined;
  /** เวอร์ชันที่ลูกค้ายืนยัน (ถ้ามี) */
  approved: MattiiDesignVersion | undefined;
}

const nowIso = () => new Date().toISOString();

export function useDesignState() {
  const { role } = useMattiiRole();
  const {
    designJobs,
    designVersions,
    orders,
    customers,
    staff,
    advanceOrder,
    moveOrder,
    addActivity,
    addDesignVersion,
    patchDesignJob,
    patchDesignVersion,
  } = useMattiiData();

  const views = useMemo<DesignJobView[]>(() => {
    return designJobs
      .map((job) => {
        const order = orders.find((o) => o.id === job.order_id);
        const versions = designVersions
          .filter((v) => v.design_job_id === job.id)
          .sort((a, b) => a.version_no - b.version_no);
        return {
          job,
          order,
          customer: order ? customers.find((c) => c.id === order.customer_id) : undefined,
          designer: staff.find((s) => s.id === job.assigned_designer_id),
          versions,
          latest: versions[versions.length - 1],
          approved: versions.find((v) => v.id === job.approved_version_id),
        };
      })
      .sort((a, b) => b.job.updated_at.localeCompare(a.job.updated_at));
  }, [designJobs, designVersions, orders, customers, staff]);

  /** อัปโหลดไฟล์ลายเวอร์ชันใหม่ (mock) — คืนเวอร์ชันที่สร้าง */
  const uploadVersion = useCallback(
    (view: DesignJobView, fileName: string, note: string | null) => {
      const row = addDesignVersion(view.job.id, {
        file_name: fileName,
        note,
        uploaded_by_id: view.job.assigned_designer_id ?? "stf-design-1",
      });
      if (!row) return undefined;
      patchDesignJob(view.job.id, {
        status: view.job.status === "queued" ? "in_progress" : view.job.status,
        started_at: view.job.started_at ?? nowIso(),
      });
      addActivity(
        view.job.order_id,
        "file_upload",
        `อัปโหลดไฟล์ลายเวอร์ชัน v${row.version_no} (${fileName})`,
      );
      return row;
    },
    [addActivity, addDesignVersion, patchDesignJob],
  );

  /** ส่งให้ลูกค้ายืนยันลาย — designing → awaiting_cf (ผ่าน guard order-flow) */
  const sendForCf = useCallback(
    (view: DesignJobView, versionId: string) => {
      patchDesignVersion(versionId, { cf_status: "sent", cf_sent_at: nowIso() });
      patchDesignJob(view.job.id, { cf_status: "sent", status: "waiting_cf" });
      if (view.order && view.order.status === "designing" && canAdvance("designing", role)) {
        advanceOrder(view.order.id);
      } else {
        addActivity(view.job.order_id, "cf_result", "ส่งไฟล์ลายให้ลูกค้ายืนยัน");
      }
    },
    [advanceOrder, addActivity, patchDesignJob, patchDesignVersion, role],
  );

  /** Sale บันทึกว่า "ลูกค้ายืนยันแล้ว" — awaiting_cf → cf_approved */
  const recordCfApproved = useCallback(
    (view: DesignJobView, versionId: string, feedback: string) => {
      patchDesignVersion(versionId, {
        cf_status: "approved",
        cf_responded_at: nowIso(),
        customer_feedback: feedback || "ลูกค้ายืนยันลายแล้ว",
      });
      patchDesignJob(view.job.id, {
        cf_status: "approved",
        status: "approved",
        approved_version_id: versionId,
        approved_at: nowIso(),
      });
      if (view.order && view.order.status === "awaiting_cf" && canAdvance("awaiting_cf", role)) {
        advanceOrder(view.order.id);
      } else {
        addActivity(view.job.order_id, "cf_result", "บันทึกผล: ลูกค้ายืนยันลายแล้ว");
      }
    },
    [advanceOrder, addActivity, patchDesignJob, patchDesignVersion, role],
  );

  /** Sale บันทึกว่า "ลูกค้าขอแก้" — awaiting_cf → designing + revision_count += 1 */
  const recordCfRejected = useCallback(
    (view: DesignJobView, versionId: string, feedback: string) => {
      patchDesignVersion(versionId, {
        cf_status: "rejected",
        cf_responded_at: nowIso(),
        customer_feedback: feedback,
      });
      patchDesignJob(view.job.id, {
        cf_status: "rejected",
        status: "revising",
        revision_count: view.job.revision_count + 1,
      });
      if (view.order && canSendBackToDesign(view.order.status, role)) {
        moveOrder(
          view.order.id,
          "designing",
          `ลูกค้าขอแก้ลาย → ${ORDER_STATUS_LABEL.designing} (รอบแก้ที่ ${view.job.revision_count + 1})`,
        );
      } else {
        addActivity(view.job.order_id, "cf_result", `บันทึกผล: ลูกค้าขอแก้ลาย — ${feedback}`);
      }
    },
    [addActivity, moveOrder, patchDesignJob, patchDesignVersion, role],
  );

  /** 🔒 คนกดเท่านั้น — AI ตั้งค่านี้ให้ไม่ได้ (Contract §5.2) */
  const setPrintReady = useCallback(
    (view: DesignJobView, versionId: string, value: boolean) => {
      patchDesignVersion(versionId, { is_print_ready: value });
      addActivity(
        view.job.order_id,
        "note",
        value ? "ทำเครื่องหมายไฟล์ลายว่าพร้อมพิมพ์ (ยืนยันโดยผู้ใช้)" : "ยกเลิกสถานะไฟล์พร้อมพิมพ์",
      );
    },
    [addActivity, patchDesignVersion],
  );

  return {
    views,
    uploadVersion,
    sendForCf,
    recordCfApproved,
    recordCfRejected,
    setPrintReady,
  };
}
