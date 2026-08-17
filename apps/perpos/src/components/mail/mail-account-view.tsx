"use client";

/**
 * หน้าตั้งค่าบัญชีของผู้ใช้เมล — ชื่อที่แสดง · รูปโปรไฟล์ · รหัสผ่าน
 *
 * กฎ:
 *  - ทุกอย่างทำในนามผู้ใช้ผ่าน `/api/mail/account/*` (cookie ของตัวเอง) — ไม่มีสิทธิ์แอดมินในเส้นนี้
 *  - เปลี่ยนรหัสผ่านต้องกรอกรหัสปัจจุบันเสมอ · **ห้ามเก็บรหัสไว้ใน state นานเกินจำเป็น**
 *  - รูปโปรไฟล์เห็นเฉพาะในเว็บเมลของเรา — บอกผู้ใช้ตรง ๆ อย่าให้เข้าใจผิดว่าปลายทางเห็นด้วย
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text, Title } from "@/components/ui/typography";

type Status = { tone: "ok" | "error"; text: string } | null;

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Note({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p className={`mt-2 text-xs ${status.tone === "ok" ? "text-green-600" : "text-red-600"}`}>
      {status.text}
    </p>
  );
}

export function MailAccountView({ basePath }: { basePath: string }) {
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [nameStatus, setNameStatus] = useState<Status>(null);
  const [savingName, setSavingName] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<Status>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const filePicker = useRef<HTMLInputElement>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwStatus, setPwStatus] = useState<Status>(null);
  const [savingPw, setSavingPw] = useState(false);

  const loadAvatar = useCallback(async () => {
    const res = await fetch("/api/mail/account/avatar", { cache: "no-store" });
    if (!res.ok) return;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return setAvatarUrl(null);
    const blob = await res.blob();
    setAvatarUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/mail/account/profile", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { email?: string; displayName?: string };
        setEmail(data.email ?? null);
        setDisplayName(data.displayName ?? "");
        setSavedName(data.displayName ?? "");
      }
      await loadAvatar();
    })();
  }, [loadAvatar]);

  async function saveName() {
    setSavingName(true);
    setNameStatus(null);
    try {
      const res = await fetch("/api/mail/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(json?.error?.message ?? "บันทึกไม่สำเร็จ");
      setSavedName(displayName.trim());
      setNameStatus({ tone: "ok", text: "บันทึกแล้ว — ผู้รับจะเห็นชื่อนี้ในเมลฉบับต่อไป" });
    } catch (e) {
      setNameStatus({ tone: "error", text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setSavingName(false);
    }
  }

  async function uploadAvatar(file: File) {
    setAvatarBusy(true);
    setAvatarStatus(null);
    try {
      const res = await fetch("/api/mail/account/avatar", {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(json?.error?.message ?? "อัปโหลดไม่สำเร็จ");
      await loadAvatar();
      setAvatarStatus({ tone: "ok", text: "เปลี่ยนรูปแล้ว" });
    } catch (e) {
      setAvatarStatus({ tone: "error", text: e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ" });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    setAvatarStatus(null);
    try {
      await fetch("/api/mail/account/avatar", { method: "DELETE" });
      setAvatarUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setAvatarStatus({ tone: "ok", text: "เอารูปออกแล้ว" });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function changePassword() {
    if (next !== confirm) {
      return setPwStatus({ tone: "error", text: "รหัสผ่านใหม่กับการยืนยันไม่ตรงกัน" });
    }
    setSavingPw(true);
    setPwStatus(null);
    try {
      const res = await fetch("/api/mail/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "change_password",
          currentPassword: current,
          newPassword: next,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(json?.error?.message ?? "เปลี่ยนรหัสผ่านไม่สำเร็จ");
      // ล้างค่าออกจากหน่วยความจำทันทีที่ทำเสร็จ
      setCurrent("");
      setNext("");
      setConfirm("");
      setPwStatus({
        tone: "ok",
        text: "เปลี่ยนรหัสผ่านแล้ว — อุปกรณ์อื่น (Outlook/มือถือ) ต้องใส่รหัสใหม่ด้วย",
      });
    } catch (e) {
      setPwStatus({
        tone: "error",
        text: e instanceof Error ? e.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ",
      });
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="กลับไปที่กล่องเมล">
          <Link href={basePath || "/"}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <Title as="h1" className="truncate text-xl font-semibold">
            บัญชีของฉัน
          </Title>
          <Text className="truncate text-sm text-gray-500">{email ?? "—"}</Text>
        </div>
      </div>

      <Card
        title="รูปโปรไฟล์"
        description="เห็นเฉพาะในเว็บเมลนี้ · ผู้รับปลายทางไม่เห็น (อีเมลไม่มีมาตรฐานรูปโปรไฟล์) · PNG/JPEG/WEBP ไม่เกิน 256 KB"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- รูปมาจาก blob: ของผู้ใช้เอง ไม่ผ่าน CDN
              <img src={avatarUrl} alt="รูปโปรไฟล์" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-7 w-7 text-gray-400" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={filePicker}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadAvatar(f);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={avatarBusy}
              onClick={() => filePicker.current?.click()}
            >
              {avatarBusy ? "กำลังอัปโหลด…" : avatarUrl ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
            </Button>
            {avatarUrl && (
              <Button
                variant="ghost"
                size="sm"
                disabled={avatarBusy}
                onClick={() => void removeAvatar()}
              >
                <Trash2 className="h-4 w-4" /> เอาออก
              </Button>
            )}
          </div>
        </div>
        <Note status={avatarStatus} />
      </Card>

      <Card title="ชื่อที่แสดง" description="ชื่อที่ผู้รับเห็นหน้าที่อยู่อีเมลของคุณ">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <Label htmlFor="mail-display-name">ชื่อ</Label>
            <Input
              id="mail-display-name"
              className="mt-1"
              value={displayName}
              placeholder="เช่น ฝ่ายขาย EXWorker"
              maxLength={80}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <Button
            disabled={savingName || displayName.trim() === savedName}
            onClick={() => void saveName()}
          >
            {savingName ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </div>
        <Note status={nameStatus} />
      </Card>

      <Card
        title="รหัสผ่าน"
        description="ใช้กับทั้งเว็บเมลนี้และการตั้งค่าใน Outlook / มือถือ — เปลี่ยนแล้วต้องอัปเดตทุกอุปกรณ์"
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="mail-pw-current">รหัสผ่านปัจจุบัน</Label>
            <Input
              id="mail-pw-current"
              type="password"
              autoComplete="current-password"
              className="mt-1"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="mail-pw-new">รหัสผ่านใหม่</Label>
            <Input
              id="mail-pw-new"
              type="password"
              autoComplete="new-password"
              className="mt-1"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              เซิร์ฟเวอร์ปฏิเสธรหัสที่เดาง่าย — ใช้ให้ยาวหรือผสมคำที่ไม่ใช่คำทั่วไป
            </p>
          </div>
          <div>
            <Label htmlFor="mail-pw-confirm">ยืนยันรหัสผ่านใหม่</Label>
            <Input
              id="mail-pw-confirm"
              type="password"
              autoComplete="new-password"
              className="mt-1"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button
            disabled={savingPw || !current || !next || !confirm}
            onClick={() => void changePassword()}
          >
            {savingPw ? "กำลังเปลี่ยน…" : "เปลี่ยนรหัสผ่าน"}
          </Button>
          <Note status={pwStatus} />
        </div>
      </Card>
    </div>
  );
}
