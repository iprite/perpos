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
import { Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented";
import { Text, Title } from "@/components/ui/typography";
import { useMailLocale } from "@/components/mail/mail-locale";
import { MAIL_LOCALES, type MailLocale } from "@/lib/mail/i18n";

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

export function MailAccountView() {
  const { locale, setLocale, t } = useMailLocale();
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
      if (!res.ok) throw new Error(json?.error?.message ?? t("account.name.failed"));
      setSavedName(displayName.trim());
      setNameStatus({ tone: "ok", text: t("account.name.saved") });
    } catch (e) {
      setNameStatus({
        tone: "error",
        text: e instanceof Error ? e.message : t("account.name.failed"),
      });
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
      if (!res.ok) throw new Error(json?.error?.message ?? t("account.avatar.failed"));
      await loadAvatar();
      setAvatarStatus({ tone: "ok", text: t("account.avatar.changed") });
    } catch (e) {
      setAvatarStatus({
        tone: "error",
        text: e instanceof Error ? e.message : t("account.avatar.failed"),
      });
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
      setAvatarStatus({ tone: "ok", text: t("account.avatar.removed") });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function changePassword() {
    if (next !== confirm) {
      return setPwStatus({ tone: "error", text: t("account.password.mismatch") });
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
      if (!res.ok) throw new Error(json?.error?.message ?? t("account.password.failed"));
      // ล้างค่าออกจากหน่วยความจำทันทีที่ทำเสร็จ
      setCurrent("");
      setNext("");
      setConfirm("");
      setPwStatus({
        tone: "ok",
        text: t("account.password.changed"),
      });
    } catch (e) {
      setPwStatus({
        tone: "error",
        text: e instanceof Error ? e.message : t("account.password.failed"),
      });
    } finally {
      setSavingPw(false);
    }
  }

  return (
    // โครงเดียวกับหน้า /rules — เต็มความกว้างของ main (rail อยู่ซ้ายแล้ว ไม่ต้องมีปุ่มย้อนกลับ)
    <div className="w-full space-y-4 py-4">
      <div className="min-w-0">
        <Title as="h1" className="truncate text-2xl font-semibold text-primary">
          {t("account.title")}
        </Title>
        <Text className="mt-0.5 truncate text-sm text-gray-500">{email ?? "—"}</Text>
      </div>

      {/* จอกว้างแบ่ง 2 คอลัมน์ — การ์ดสั้น ๆ ซ้อนกันเป็นแท่งเดียวเหลือที่ว่างขวาทั้งจอ */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Card title={t("account.avatar.title")} description={t("account.avatar.desc")}>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- รูปมาจาก blob: ของผู้ใช้เอง ไม่ผ่าน CDN
                  <img
                    src={avatarUrl}
                    alt={t("account.avatar.alt")}
                    className="h-full w-full object-cover"
                  />
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
                  {avatarBusy
                    ? t("account.avatar.uploading")
                    : avatarUrl
                      ? t("account.avatar.change")
                      : t("account.avatar.upload")}
                </Button>
                {avatarUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={avatarBusy}
                    onClick={() => void removeAvatar()}
                  >
                    <Trash2 className="h-4 w-4" /> {t("account.avatar.remove")}
                  </Button>
                )}
              </div>
            </div>
            <Note status={avatarStatus} />
          </Card>

          <Card title={t("account.name.title")} description={t("account.name.desc")}>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor="mail-display-name">{t("account.name.label")}</Label>
                <Input
                  id="mail-display-name"
                  className="mt-1"
                  value={displayName}
                  placeholder={t("account.name.placeholder")}
                  maxLength={80}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <Button
                disabled={savingName || displayName.trim() === savedName}
                onClick={() => void saveName()}
              >
                {savingName ? t("common.saving") : t("common.save")}
              </Button>
            </div>
            <Note status={nameStatus} />
          </Card>

          <Card title={t("account.language.title")} description={t("account.language.desc")}>
            <SegmentedControl<MailLocale>
              value={locale}
              onChange={(next) => setLocale(next)}
              ariaLabel={t("common.language")}
              options={MAIL_LOCALES.map((code) => ({
                value: code,
                label: code === "th" ? "ไทย" : "English",
              }))}
            />
            <p className="mt-2 text-xs text-gray-500">{t("account.language.hint")}</p>
          </Card>
        </div>

        <Card title={t("account.password.title")} description={t("account.password.desc")}>
          <div className="space-y-3">
            <div>
              <Label htmlFor="mail-pw-current">{t("account.password.current")}</Label>
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
              <Label htmlFor="mail-pw-new">{t("account.password.new")}</Label>
              <Input
                id="mail-pw-new"
                type="password"
                autoComplete="new-password"
                className="mt-1"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">{t("account.password.newHint")}</p>
            </div>
            <div>
              <Label htmlFor="mail-pw-confirm">{t("account.password.confirm")}</Label>
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
              {savingPw ? t("account.password.submitting") : t("account.password.submit")}
            </Button>
            <Note status={pwStatus} />
          </div>
        </Card>
      </div>
    </div>
  );
}
