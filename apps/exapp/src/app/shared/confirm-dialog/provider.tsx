"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Button } from "rizzui";

import { Modal } from "@core/modal-views/modal";

type ConfirmTone = "default" | "danger";

type ConfirmOptions = {
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmDialogContext = createContext<ConfirmFn | null>(null);

export function useConfirmDialog(): ConfirmFn {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) throw new Error("useConfirmDialog must be used within ConfirmDialogProvider");
  return ctx;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const close = useCallback((value: boolean) => {
    setOpen(false);
    setOptions(null);
    const r = resolverRef.current;
    resolverRef.current = null;
    r?.(value);
  }, []);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  const title = options?.title ?? "ยืนยันการทำรายการ";
  const confirmText = options?.confirmText ?? "ยืนยัน";
  const cancelText = options?.cancelText ?? "ยกเลิก";
  const tone = options?.tone ?? "default";

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      <Modal
        size="sm"
        isOpen={open}
        onClose={() => close(false)}
        rounded="md"
        className="z-[9999]"
      >
        <div className="rounded-xl bg-white p-5">
          <div className="text-base font-semibold text-gray-900">{title}</div>
          <div className="mt-2 text-sm text-gray-700">{options?.message}</div>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => close(false)}>
              {cancelText}
            </Button>
            <Button color={tone === "danger" ? "danger" : undefined} onClick={() => close(true)}>
              {confirmText}
            </Button>
          </div>
        </div>
      </Modal>
    </ConfirmDialogContext.Provider>
  );
}

