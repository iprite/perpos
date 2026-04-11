"use client";

import React from "react";
import { Button, Input } from "rizzui";
import AppSelect from "@core/ui/app-select";
import { Modal } from "@core/modal-views/modal";

import type { CrmDeal, CrmDealStage } from "../crm-types";

export function CrmDealModal({
  open,
  onClose,
  customerName,
  stages,
  loading,
  canEdit,
  editingDeal,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  customerName: string;
  stages: CrmDealStage[];
  loading: boolean;
  canEdit: boolean;
  editingDeal: CrmDeal | null;
  onSave: (payload: {
    id?: string;
    title: string;
    amount: number;
    stage_key: string;
    probability: number;
    expected_close_date: string | null;
    status: "open" | "won" | "lost";
  }) => Promise<void>;
}) {
  const [title, setTitle] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [stageKey, setStageKey] = React.useState("qualification");
  const [probability, setProbability] = React.useState("0");
  const [expectedClose, setExpectedClose] = React.useState("");

  React.useEffect(() => {
    setTitle(editingDeal?.title ?? "");
    setAmount(editingDeal ? String(editingDeal.amount) : "");
    setStageKey(editingDeal?.stage_key ?? "qualification");
    setProbability(editingDeal ? String(editingDeal.probability) : "0");
    setExpectedClose(editingDeal?.expected_close_date ?? "");
  }, [editingDeal, open]);

  const stageOptions = React.useMemo(() => stages.map((s) => ({ label: s.name, value: s.key })), [stages]);

  return (
    <Modal isOpen={open} onClose={onClose} size="md" rounded="md">
      <div className="border-b border-gray-200 px-5 py-4">
        <div className="text-sm font-semibold text-gray-900">{editingDeal ? "แก้ไขดีล" : "เพิ่มดีล"}</div>
        <div className="mt-1 text-xs text-gray-600">ลูกค้า: {customerName}</div>
      </div>
      <div className="grid gap-3 px-5 py-4">
        <Input label="ชื่อดีล" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label="มูลค่า" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        <div>
          <AppSelect
            label="Stage"
            placeholder="-"
            options={stageOptions}
            value={stageKey}
            onChange={(v: string) => setStageKey(v)}
            getOptionValue={(o) => o.value}
            displayValue={(selected) => stageOptions.find((o) => o.value === selected)?.label ?? ""}
            inPortal={false}
          />
        </div>
        <Input
          label="Probability (%)"
          value={probability}
          onChange={(e) => setProbability(e.target.value)}
          inputMode="numeric"
        />
        <Input
          label="Expected close (YYYY-MM-DD)"
          value={expectedClose}
          onChange={(e) => setExpectedClose(e.target.value)}
          placeholder="2026-04-30"
        />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-5 py-4">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          ยกเลิก
        </Button>
        <Button
          onClick={async () => {
            if (!canEdit) return;
            const t = title.trim();
            if (!t) return;
            const sk = stageKey || "qualification";
            const st = sk === "won" ? "won" : sk === "lost" ? "lost" : "open";
            await onSave({
              id: editingDeal?.id,
              title: t,
              amount: Number(amount),
              stage_key: sk,
              probability: Number(probability),
              expected_close_date: expectedClose.trim() || null,
              status: st,
            });
          }}
          disabled={!canEdit || loading || title.trim().length === 0}
        >
          บันทึก
        </Button>
      </div>
    </Modal>
  );
}
