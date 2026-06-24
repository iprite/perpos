"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <Button
      variant="outline"
      size="sm"
      onClick={copy}
      className="gap-2 font-mono"
      title="คัดลอกคำสั่งสำหรับสั่ง agent แก้"
    >
      <span>{command}</span>
      {copied ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <Copy className="h-4 w-4 text-gray-400" />
      )}
    </Button>
  );
}
