"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * CopyCommand — แสดงคำสั่งสั่ง agent (`/fix-issue <ref>`) + ปุ่มคัดลอก
 * micro-interaction: icon เปลี่ยน Copy → Check 2 วิ (DESIGN §12)
 */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard ไม่พร้อม — เงียบไว้ */
    }
  };

  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-sm text-gray-700 transition-colors hover:bg-gray-100"
      title="คัดลอกคำสั่งสำหรับสั่ง agent แก้"
    >
      <span>{command}</span>
      {copied ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4 text-gray-400" />
      )}
    </button>
  );
}
