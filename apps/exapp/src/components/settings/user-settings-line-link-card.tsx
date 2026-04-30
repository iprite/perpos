import React from "react";
import { Button } from "rizzui";
import { QRCodeCanvas } from "qrcode.react";

function maskLineUserId(id: string) {
  const s = String(id ?? "");
  if (s.length <= 8) return s;
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

export default function LineLinkCard({
  linked,
  lineUserId,
  linkUrl,
  expiresAt,
  loading,
  onRefresh,
  onUnlink,
}: {
  linked: boolean;
  lineUserId: string | null;
  linkUrl: string | null;
  expiresAt: string | null;
  loading: boolean;
  onRefresh: () => void;
  onUnlink: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="text-sm font-semibold text-gray-900">เชื่อม LINE</div>

      {linked ? (
        <div className="mt-3">
          <div className="text-sm text-gray-700">
            เชื่อมแล้ว: <span className="font-semibold">{lineUserId ? maskLineUserId(lineUserId) : "-"}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={onRefresh} disabled={loading}>
              สร้าง QR ใหม่
            </Button>
            <Button color="danger" onClick={onUnlink} disabled={loading}>
              ยกเลิกการเชื่อม
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-center justify-center rounded-xl bg-gray-50 p-4">
            {linkUrl ? (
              <QRCodeCanvas value={linkUrl} size={220} includeMargin />
            ) : (
              <div className="text-sm text-gray-600">{loading ? "กำลังสร้าง QR..." : "ยังไม่มี QR"}</div>
            )}
          </div>
          <div className="mt-3 text-xs text-gray-600">
            เปิด LINE แล้วสแกน QR จากนั้นกดส่งข้อความที่ถูกเตรียมไว้เพื่อเชื่อมบัญชีสำหรับรับการแจ้งเตือน
          </div>
          {!!expiresAt && <div className="mt-1 text-xs text-gray-500">หมดอายุ: {new Date(expiresAt).toLocaleString()}</div>}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={onRefresh} disabled={loading}>
              รีเฟรช QR
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
