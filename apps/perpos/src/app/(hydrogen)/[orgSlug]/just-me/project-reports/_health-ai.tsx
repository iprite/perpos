"use client";

/**
 * _health-ai.tsx — ปุ่ม "ให้ AI ช่วยอ่านตัวเลข" ของโครงการที่เลือก (จุดขาย Suite)
 * ⛔ AI ได้รับเฉพาะตัวเลขที่ `project-metrics.ts` คิดเสร็จแล้ว (route คิดให้) — ไม่ได้คำนวณเอง
 *    และไม่เขียนอะไรลงระบบ — เป็นความเห็นให้คนอ่านเท่านั้น
 */

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { jmSend } from "../_components/api-client";
import { AiOpinionCard, type AiOpinionView } from "../_components/ai-opinion";

export function ProjectHealthAi({
  orgId,
  projects,
}: {
  orgId: string;
  projects: { value: string; label: string }[];
}) {
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [opinion, setOpinion] = useState<AiOpinionView | null>(null);

  async function run() {
    if (!projectId) {
      notify.error("กรุณาเลือกโครงการก่อน");
      return;
    }
    setLoading(true);
    setOpinion(null);
    try {
      const res = await jmSend<{ opinion: AiOpinionView }>(orgId, "ai/project-health", "POST", {
        project_id: projectId,
      });
      setOpinion(res.opinion);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "วิเคราะห์โครงการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <Text className="text-sm font-semibold text-gray-900">ผู้ช่วย AI อ่านสุขภาพโครงการ</Text>
        <Text className="mt-1 text-xs text-gray-500">
          เลือกโครงการแล้วให้ AI อธิบายว่าตัวเลขกำลังบอกอะไร เสี่ยงตรงไหน ควรตรวจอะไรต่อ —
          ตัวเลขทั้งหมดคำนวณโดยระบบ AI ทำหน้าที่เรียบเรียงเท่านั้น
        </Text>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          value={projectId}
          onChange={setProjectId}
          options={[{ value: "", label: "— เลือกโครงการ —" }, ...projects]}
          className="w-full sm:w-96"
        />
        <Button onClick={run} disabled={loading || projects.length === 0}>
          <Sparkles className="h-4 w-4" />
          {loading ? "กำลังวิเคราะห์…" : "ให้ AI ช่วยวิเคราะห์"}
        </Button>
      </div>

      {projects.length === 0 && (
        <Text className="text-xs text-gray-400">ยังไม่มีโครงการที่ตรงกับตัวกรองให้วิเคราะห์</Text>
      )}

      {opinion && <AiOpinionCard opinion={opinion} />}
    </div>
  );
}
