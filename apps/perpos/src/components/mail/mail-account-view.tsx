"use client";

/**
 * หน้าตั้งค่าบัญชีของผู้ใช้เมล — แบ่งเป็นเมนูย่อย: โปรไฟล์ · ลายเซ็น · รหัสผ่าน · ภาษา
 *
 * กฎ:
 *  - ทุกอย่างทำในนามผู้ใช้ผ่าน `/api/mail/account/*` (cookie ของตัวเอง) — ไม่มีสิทธิ์แอดมินในเส้นนี้
 *  - เปลี่ยนรหัสผ่านต้องกรอกรหัสปัจจุบันเสมอ · **ห้ามเก็บรหัสไว้ใน state นานเกินจำเป็น**
 *  - รูปโปรไฟล์เห็นเฉพาะในเว็บเมลของเรา — บอกผู้ใช้ตรง ๆ อย่าให้เข้าใจผิดว่าปลายทางเห็นด้วย
 *  - **ลายเซ็นอยู่ใน `perpos-prefs.json` ของกล่องเมลเอง** (ไม่ใช่ DB ของ PERPOS — invariant ข้อ 1
 *    ของโซน `(mail)`) · เขียนผ่าน `PUT /api/mail/prefs` ที่ merge ทีละช่อง ⇒ ส่งเฉพาะช่องลายเซ็นได้
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Globe, KeyRound, PenLine, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/segmented";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatusBadge } from "@/components/ui/badge";
import { Text, Title } from "@/components/ui/typography";
import { useMailLocale } from "@/components/mail/mail-locale";
import { MAIL_LOCALES, type MailLocale } from "@/lib/mail/i18n";
import { MAIL_SIGNATURE_MAX, fetchMailPrefsShared } from "@/lib/mail/prefs-storage";
import { applySignature } from "@/lib/mail/compose";
import type { MailPrefs } from "@/lib/mail/types";

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

type AccountTab = "profile" | "signature" | "password" | "language";

export function MailAccountView() {
  const { locale, setLocale, t } = useMailLocale();
  const [tab, setTab] = useState<AccountTab>("profile");
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [nameStatus, setNameStatus] = useState<Status>(null);
  const [savingName, setSavingName] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<Status>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const filePicker = useRef<HTMLInputElement>(null);

  /** ที่อยู่ทั้งหมดที่ส่งในนามได้ (ที่อยู่หลัก + นามแฝง) — มาจาก Identity ของเมลเซิร์ฟเวอร์ */
  const [identities, setIdentities] = useState<{ email: string; name: string }[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [savedNames, setSavedNames] = useState<Record<string, string>>({});
  const [defaultFrom, setDefaultFrom] = useState("");
  const [savedDefaultFrom, setSavedDefaultFrom] = useState("");
  const [replyFromReceived, setReplyFromReceived] = useState(true);
  const [savedReplyFrom, setSavedReplyFrom] = useState(true);
  const [senderStatus, setSenderStatus] = useState<Status>(null);
  const [savingSender, setSavingSender] = useState(false);

  const [signature, setSignature] = useState("");
  const [savedSignature, setSavedSignature] = useState("");
  const [signatureOnReply, setSignatureOnReply] = useState(true);
  const [savedOnReply, setSavedOnReply] = useState(true);
  /** ลายเซ็นแยกรายที่อยู่ — คีย์ = อีเมลตัวพิมพ์เล็ก · ไม่มีคีย์ = ที่อยู่นั้นใช้ลายเซ็นหลัก */
  const [sigByAddress, setSigByAddress] = useState<Record<string, string>>({});
  const [savedSigByAddress, setSavedSigByAddress] = useState<Record<string, string>>({});
  /** กำลังแก้ลายเซ็นของที่อยู่ไหน — `""` = ลายเซ็นหลัก (ใช้กับทุกที่อยู่ที่ไม่ได้ตั้งแยก) */
  const [sigScope, setSigScope] = useState("");
  const [sigStatus, setSigStatus] = useState<Status>(null);
  const [savingSig, setSavingSig] = useState(false);

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
        const data = (await res.json()) as {
          email?: string;
          displayName?: string;
          identities?: { email: string; name: string }[];
        };
        setEmail(data.email ?? null);
        setDisplayName(data.displayName ?? "");
        setSavedName(data.displayName ?? "");
        const list = (data.identities ?? []).filter((i) => !!i.email);
        setIdentities(list);
        const map = Object.fromEntries(list.map((i) => [i.email.toLowerCase(), i.name ?? ""]));
        setNames(map);
        setSavedNames(map);
      }
      await loadAvatar();
    })();
  }, [loadAvatar]);

  // ลายเซ็นอยู่ในไฟล์ความชอบเดียวกับมุมมอง/ภาษา (คำขอถูกแชร์กับ MailLocaleProvider)
  useEffect(() => {
    let alive = true;
    void fetchMailPrefsShared<MailPrefs>().then((data) => {
      if (!alive || !data) return;
      const text = typeof data.signature === "string" ? data.signature : "";
      const onReply = data.signatureOnReply !== false;
      const byAddress =
        data.signatureByAddress && typeof data.signatureByAddress === "object"
          ? { ...data.signatureByAddress }
          : {};
      setSignature(text);
      setSavedSignature(text);
      setSignatureOnReply(onReply);
      setSavedOnReply(onReply);
      setSigByAddress(byAddress);
      setSavedSigByAddress(byAddress);
      const from = typeof data.defaultFromEmail === "string" ? data.defaultFromEmail : "";
      const replyFrom = data.replyFromReceived !== false;
      setDefaultFrom(from);
      setSavedDefaultFrom(from);
      setReplyFromReceived(replyFrom);
      setSavedReplyFrom(replyFrom);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function saveSignature() {
    setSavingSig(true);
    setSigStatus(null);
    try {
      const res = await fetch("/api/mail/prefs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        // ส่งเฉพาะช่องลายเซ็น — route รวมกับค่าเดิม (มุมมอง/ความกว้าง/ภาษาของ workspace ต้องไม่ถูกรีเซ็ต)
        body: JSON.stringify({ signature, signatureOnReply, signatureByAddress: sigByAddress }),
      });
      if (!res.ok) throw new Error(t("account.signature.failed"));
      const saved = (await res.json().catch(() => null)) as Partial<MailPrefs> | null;
      const text = typeof saved?.signature === "string" ? saved.signature : signature.trimEnd();
      const byAddress =
        saved?.signatureByAddress && typeof saved.signatureByAddress === "object"
          ? { ...saved.signatureByAddress }
          : sigByAddress;
      setSignature(text);
      setSavedSignature(text);
      setSavedOnReply(signatureOnReply);
      setSigByAddress(byAddress);
      setSavedSigByAddress(byAddress);
      setSigStatus({ tone: "ok", text: t("account.signature.saved") });
    } catch (e) {
      setSigStatus({
        tone: "error",
        text: e instanceof Error ? e.message : t("account.signature.failed"),
      });
    } finally {
      setSavingSig(false);
    }
  }

  /** บันทึก "ที่อยู่ผู้ส่ง" — ชื่อรายที่อยู่ไปที่เมลเซิร์ฟเวอร์ · ที่อยู่เริ่มต้น/กฎการตอบไปที่ prefs */
  async function saveSender() {
    setSavingSender(true);
    setSenderStatus(null);
    try {
      const [profileRes, prefsRes] = await Promise.all([
        fetch("/api/mail/account/profile", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ names }),
        }),
        fetch("/api/mail/prefs", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ defaultFromEmail: defaultFrom, replyFromReceived }),
        }),
      ]);
      const json = (await profileRes.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!profileRes.ok) throw new Error(json?.error?.message ?? t("account.sender.failed"));
      if (!prefsRes.ok) throw new Error(t("account.sender.failed"));
      setSavedNames({ ...names });
      setSavedDefaultFrom(defaultFrom);
      setSavedReplyFrom(replyFromReceived);
      setSenderStatus({ tone: "ok", text: t("account.sender.saved") });
    } catch (e) {
      setSenderStatus({
        tone: "error",
        text: e instanceof Error ? e.message : t("account.sender.failed"),
      });
    } finally {
      setSavingSender(false);
    }
  }

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

  /**
   * ลายเซ็นของ scope ที่กำลังแก้ · `""` = ลายเซ็นหลัก
   * ที่อยู่ที่ยังไม่ได้ตั้งแยก จะเห็นช่องว่าง (พร้อมคำอธิบายว่ายังใช้ค่าเริ่มต้นอยู่) —
   * **ห้ามเติมลายเซ็นหลักลงไปให้เอง** ไม่งั้นพอกดบันทึกจะกลายเป็นตั้งแยกโดยผู้ใช้ไม่ได้ตั้งใจ
   */
  const scopedSignature = sigScope ? (sigByAddress[sigScope] ?? "") : signature;
  const setScopedSignature = (value: string) => {
    if (!sigScope) return setSignature(value);
    setSigByAddress((prev) => {
      const next = { ...prev };
      if (value.trim()) next[sigScope] = value;
      else delete next[sigScope]; // ว่าง = กลับไปใช้ลายเซ็นหลัก
      return next;
    });
  };

  const sameMap = (a: Record<string, string>, b: Record<string, string>) =>
    JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

  const TABS = [
    {
      value: "profile" as const,
      label: t("account.tab.profile"),
      icon: <UserRound className="h-4 w-4" />,
    },
    {
      value: "signature" as const,
      label: t("account.tab.signature"),
      icon: <PenLine className="h-4 w-4" />,
    },
    {
      value: "password" as const,
      label: t("account.tab.password"),
      icon: <KeyRound className="h-4 w-4" />,
    },
    {
      value: "language" as const,
      label: t("account.tab.language"),
      icon: <Globe className="h-4 w-4" />,
    },
  ];

  return (
    // โครงเดียวกับหน้า /rules — เต็มความกว้างของ main (rail อยู่ซ้ายแล้ว ไม่ต้องมีปุ่มย้อนกลับ)
    <div className="w-full space-y-4 py-4">
      <div className="min-w-0">
        <Title as="h1" className="truncate text-2xl font-semibold text-primary">
          {t("account.title")}
        </Title>
        <Text className="mt-0.5 truncate text-sm text-gray-500">{email ?? "—"}</Text>
      </div>

      {/* เมนูย่อย — pill ตาม DESIGN.md §4 (แท็บในหน้ามีมาตรฐานเดียว) */}
      <SegmentedControl
        value={tab}
        onChange={setTab}
        ariaLabel={t("account.title")}
        options={TABS}
      />

      {tab === "profile" && (
        <div className="grid gap-4 xl:grid-cols-2">
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

          {identities.length > 1 && (
            <Card title={t("account.sender.title")} description={t("account.sender.desc")}>
              <div className="space-y-3">
                <ul className="space-y-2">
                  {identities.map((identity) => {
                    const key = identity.email.toLowerCase();
                    const isDefault = defaultFrom
                      ? defaultFrom === key
                      : key === email?.toLowerCase();
                    return (
                      <li key={key} className="rounded-lg border border-gray-200 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium text-gray-900">
                            {identity.email}
                          </span>
                          {isDefault ? (
                            <StatusBadge tone="info">{t("account.sender.defaultOn")}</StatusBadge>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => setDefaultFrom(key)}>
                              {t("account.sender.default")}
                            </Button>
                          )}
                        </div>
                        <Input
                          className="mt-2"
                          value={names[key] ?? ""}
                          maxLength={80}
                          placeholder={t("account.name.placeholder")}
                          onChange={(e) => setNames((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-gray-500">{t("account.sender.defaultHint")}</p>

                <div>
                  <Label>{t("account.sender.replyFrom")}</Label>
                  <div className="mt-1">
                    <SegmentedControl
                      value={replyFromReceived ? "on" : "off"}
                      onChange={(v) => setReplyFromReceived(v === "on")}
                      ariaLabel={t("account.sender.replyFrom")}
                      options={[
                        { value: "on", label: t("account.signature.onReply.on") },
                        { value: "off", label: t("account.signature.onReply.off") },
                      ]}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{t("account.sender.replyFromHint")}</p>
                </div>

                <Button
                  disabled={
                    savingSender ||
                    (sameMap(names, savedNames) &&
                      defaultFrom === savedDefaultFrom &&
                      replyFromReceived === savedReplyFrom)
                  }
                  onClick={() => void saveSender()}
                >
                  {savingSender ? t("common.saving") : t("common.save")}
                </Button>
                <Note status={senderStatus} />
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "signature" && (
        <Card title={t("account.signature.title")} description={t("account.signature.desc")}>
          <div className="space-y-3">
            {identities.length > 1 && (
              <div>
                <Label htmlFor="mail-signature-scope">{t("account.signature.scope")}</Label>
                <CustomSelect
                  className="mt-1 max-w-sm"
                  value={sigScope}
                  onChange={setSigScope}
                  options={[
                    { value: "", label: t("account.signature.scope.default") },
                    ...identities.map((i) => ({
                      value: i.email.toLowerCase(),
                      label: i.email,
                    })),
                  ]}
                />
              </div>
            )}

            <div>
              <Label htmlFor="mail-signature">{t("account.signature.label")}</Label>
              <Textarea
                id="mail-signature"
                rows={6}
                className="mt-1 font-mono"
                value={scopedSignature}
                maxLength={MAIL_SIGNATURE_MAX}
                placeholder={t("account.signature.placeholder")}
                onChange={(e) => setScopedSignature(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-400">
                {t("account.signature.counter", {
                  used: scopedSignature.length,
                  max: MAIL_SIGNATURE_MAX,
                })}
              </p>
              {sigScope && !scopedSignature.trim() && (
                <p className="mt-1 text-xs text-gray-500">{t("account.signature.inherits")}</p>
              )}
            </div>

            <div>
              <Label>{t("account.signature.onReply")}</Label>
              <div className="mt-1">
                <SegmentedControl
                  value={signatureOnReply ? "on" : "off"}
                  onChange={(v) => setSignatureOnReply(v === "on")}
                  ariaLabel={t("account.signature.onReply")}
                  options={[
                    { value: "on", label: t("account.signature.onReply.on") },
                    { value: "off", label: t("account.signature.onReply.off") },
                  ]}
                />
              </div>
            </div>

            {scopedSignature.trim() && (
              <div>
                <p className="text-xs text-gray-500">{t("account.signature.preview")}</p>
                {/* ตัวอย่างใช้ฟังก์ชันเดียวกับกล่องเขียนจริง — สิ่งที่เห็นคือสิ่งที่ผู้รับได้ */}
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  {applySignature("", scopedSignature).replace(/^\n+/, "")}
                </pre>
              </div>
            )}

            <p className="text-xs text-gray-500">{t("account.signature.hint")}</p>

            <Button
              disabled={
                savingSig ||
                (signature.trimEnd() === savedSignature &&
                  signatureOnReply === savedOnReply &&
                  sameMap(sigByAddress, savedSigByAddress))
              }
              onClick={() => void saveSignature()}
            >
              {savingSig ? t("common.saving") : t("common.save")}
            </Button>
            <Note status={sigStatus} />
          </div>
        </Card>
      )}

      {tab === "password" && (
        <Card title={t("account.password.title")} description={t("account.password.desc")}>
          <div className="max-w-md space-y-3">
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
      )}

      {tab === "language" && (
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
      )}
    </div>
  );
}
