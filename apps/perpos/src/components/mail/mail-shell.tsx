"use client";

/**
 * เปลือกของ **PERPOS Mail** — ผลิตภัณฑ์ที่ 3 ที่แยกขาดจาก Suite (ERP) และ Flow (ผู้ช่วย AI)
 *
 * ทำไมไม่ใช้ `HydrogenLayout`/`PageShell`:
 *   ลูกค้าเมลไม่จำเป็นต้องมีบัญชี PERPOS — ตัวตนคือ **mail account ที่ผ่าน OAuth ของ Stalwart**
 *   เท่านั้น จึงห้ามมี AuthGuard / org switcher / เมนูของ ERP ในหน้านี้ และห้ามมีลิงก์ข้ามไปแอปอื่น
 *
 * โครง: topbar 3rem (แบรนด์ + บัญชี) · rail กล่องเมล (แนวตั้งบน ≥md, แถบเลื่อนแนวนอนบนจอแคบ)
 * — rail แทน sidebar ของ PERPOS ที่ MAIL_UI_SPEC §1 เคยยืมมาใช้เป็น left rail
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Archive,
  Folder,
  Inbox,
  Mail,
  Send,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Star,
  Trash2,
  FileText,
  UserRound,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { Popover } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import { MailFoldersDialog } from "@/components/mail/mail-folders-dialog";
import { MailWordmark } from "@/components/mail/mail-wordmark";
import { clearCachedPane } from "@/lib/mail/prefs-storage";
import type { MailLocale } from "@/lib/mail/i18n";
import {
  MailLocaleProvider,
  clearCachedMailLocale,
  useMailLocale,
} from "@/components/mail/mail-locale";
import { MAIL_BOX_ORDER, folderBoxValue, mailBoxLabel, resolveBoxSelector } from "@/lib/mail/boxes";
import type { MailBoxKey, MailFolder, MailboxSummary } from "@/lib/mail/types";

const BOX_ICON: Record<MailBoxKey, React.ReactNode> = {
  inbox: <Inbox className="h-4 w-4 shrink-0" />,
  starred: <Star className="h-4 w-4 shrink-0" />,
  sent: <Send className="h-4 w-4 shrink-0" />,
  drafts: <FileText className="h-4 w-4 shrink-0" />,
  archive: <Archive className="h-4 w-4 shrink-0" />,
  junk: <ShieldAlert className="h-4 w-4 shrink-0" />,
  trash: <Trash2 className="h-4 w-4 shrink-0" />,
};

function MailBrand() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mail-600 text-white">
        <Mail className="h-4 w-4" />
      </span>
      <MailWordmark size="sm" />
    </span>
  );
}

/**
 * ชิปบัญชี — อีเมลของกล่องที่เชื่อมอยู่ + ปุ่มออกจากระบบ
 * cookie ของ session ถูกจำกัด path ไว้ที่ `/api/mail` (ตั้งใจ — หน้าเว็บไม่ควรถือ token)
 * ⇒ อ่านฝั่ง server ไม่ได้ ต้องถาม `/api/mail/account` เอา
 */
function MailAccountMenu({ basePath }: { basePath: string }) {
  const { t } = useMailLocale();
  const [email, setEmail] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  /** รูปโปรไฟล์เก็บอยู่ในกล่องเมลของเจ้าตัว — ต้องดึงผ่าน API ของเรา (cookie อยู่ path /api/mail) */
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    // รูปเป็นของประดับ — รอให้รายการเมล/กล่องขึ้นก่อน (เซิร์ฟเวอร์ทำทีละ request) ค่อยดึง
    const loadAvatar = () =>
      fetch("/api/mail/account/avatar")
        .then((res) => (res.headers.get("content-type")?.startsWith("image/") ? res.blob() : null))
        .then((blob) => {
          if (!alive || !blob) return;
          url = URL.createObjectURL(blob);
          setAvatar(url);
        })
        .catch(() => {
          /* ไม่มีรูป = ใช้อักษรย่อ ไม่ต้องรบกวนผู้ใช้ */
        });
    const timer = setTimeout(() => void loadAvatar(), 1500);
    return () => {
      alive = false;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/mail/account")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { connected?: boolean; email?: string | null } | null) => {
        if (alive && data?.connected && data.email) setEmail(data.email);
      })
      .catch(() => {
        /* ชิปบัญชีไม่ขึ้นชื่อ ไม่ใช่เรื่องที่ต้องรบกวนผู้ใช้ */
      });
    return () => {
      alive = false;
    };
  }, []);

  async function signOut() {
    setSigningOut(true);
    // ความชอบของคนนี้ต้องไม่ค้างให้คนถัดไปที่ใช้เครื่องเดียวกันเห็น (ค่าจริงอยู่ในกล่องเมลอยู่แล้ว)
    clearCachedPane();
    clearCachedMailLocale();
    try {
      const res = await fetch("/api/mail/oauth/disconnect", { method: "POST" });
      const data = (await res.json().catch(() => null)) as { redirectTo?: string } | null;
      window.location.href = `${basePath}${data?.redirectTo ?? "/login?reason=disconnected"}`;
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <Popover
      placement="bottom-end"
      /* trigger สูงไม่เต็ม header (48px) — ระยะปกติ 6px วัดจากตัวปุ่ม ทำให้ panel ไปชนเส้นขอบ
         ของ header พอดี · 14 = ระยะจากปุ่มถึงขอบ (8) + ช่องไฟที่ควรเห็น (6) */
      offset={14}
      trigger={
        <button
          type="button"
          className="flex max-w-[14rem] items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-[11px] font-semibold uppercase text-gray-600">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob: ของผู้ใช้เอง ไม่ผ่าน CDN
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              (email ?? "?").slice(0, 1)
            )}
          </span>
          <span className="truncate">{email ?? t("shell.account.myAccount")}</span>
        </button>
      }
    >
      <div className="min-w-[240px] p-3">
        <Text className="text-xs text-gray-500">{t("shell.account.connectedMailbox")}</Text>
        <p className="mt-0.5 truncate text-sm font-medium text-gray-900">{email ?? "—"}</p>
        <Text className="mt-3 text-xs text-gray-500">
          {t("shell.account.signOutNotePrefix")}
          <strong>{t("shell.account.signOutNoteDevice")}</strong>
          {t("shell.account.signOutNoteSuffix")}
        </Text>
        <Button variant="outline" className="mt-3 w-full" asChild>
          <Link href={`${basePath}/account`}>
            <UserRound className="h-4 w-4" /> {t("shell.account.myAccount")}
          </Link>
        </Button>
        <Button
          variant="outline"
          className="mt-2 w-full"
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          {signingOut ? t("shell.account.signingOut") : t("shell.account.signOut")}
        </Button>
      </div>
    </Popover>
  );
}

function MailRail({ basePath }: { basePath: string }) {
  const { locale, t } = useMailLocale();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  /**
   * ตัวเลขยังไม่ได้อ่านข้าง rail (M3 — เลื่อนมาจาก M1 ตาม UI_SPEC §1)
   * · `text-xs text-gray-500` **ห้ามใช้ badge สีแดง** (DESIGN.md §14: แดง = ผิดพลาดเท่านั้น)
   * · ไม่มีข้อมูล = ไม่แสดงอะไร (null ไม่ใช่ 0)
   * · **ตัวเลขมาจาก workspace ทางเดียว** (event `mail:mailboxes`) — rail ไม่ยิง API เอง
   *   ไม่งั้นสองที่ยิงคนละจังหวะ ตัวเลขบนหัวรายการกับข้าง rail จะขัดกันเอง + เรียก JMAP ซ้ำซ้อน
   *   (workspace ยิงตอนเปิดหน้า, หลังอ่าน/ลบ/เก็บ/รีเฟรช และตอน poll เมลใหม่อยู่แล้ว)
   */
  const [unread, setUnread] = useState<Record<string, number | null>>({});
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  /** ได้ข้อมูลจากหน้ารายการแล้วหรือยัง — ถ้าได้ ห้าม rail ยิงเอง (ดูคำอธิบายด้านบน) */
  const gotEventRef = useRef(false);
  /** อยู่หน้ารายการเมล (มี `<MailWorkspace>`) หรือไม่ — ตัดสินว่า rail ต้องดึงชุดกล่องเองไหม */
  const onWorkspacePage =
    pathname === `${basePath}/` || pathname === basePath || pathname === "/mail";

  const applyPayload = useCallback((mailboxes: MailboxSummary[], next: MailFolder[]) => {
    setUnread(Object.fromEntries(mailboxes.map((m) => [m.key, m.unreadCount])));
    setFolders(next);
  }, []);

  /**
   * ทางสำรองเฉพาะหน้าที่**ไม่มี** `<MailWorkspace>` (เช่น /account, /rules)
   * — ที่นั่นไม่มีใครยิงแทน ถ้าไม่ทำ rail จะไม่มีโฟลเดอร์ให้กดเลย
   */
  const fetchSelf = useCallback(async () => {
    try {
      const res = await fetch("/api/mail/mailboxes");
      if (!res.ok) return;
      const d = (await res.json()) as { mailboxes?: MailboxSummary[]; folders?: MailFolder[] };
      applyPayload(d.mailboxes ?? [], d.folders ?? []);
    } catch {
      /* rail ไม่มีตัวเลข/โฟลเดอร์ = ไม่ใช่เรื่องที่ต้องรบกวนผู้ใช้ */
    }
  }, [applyPayload]);

  useEffect(() => {
    const onMailboxes = (e: Event) => {
      const detail = (e as CustomEvent<{ mailboxes?: MailboxSummary[]; folders?: MailFolder[] }>)
        .detail;
      if (!detail || !Array.isArray(detail.mailboxes)) return;
      gotEventRef.current = true;
      applyPayload(detail.mailboxes, detail.folders ?? []);
    };
    const onFoldersChanged = () => {
      if (!gotEventRef.current) void fetchSelf();
    };
    window.addEventListener("mail:mailboxes", onMailboxes);
    window.addEventListener("mail:folders-changed", onFoldersChanged);
    // หน้ารายการ: workspace ส่งชุดกล่องมาพร้อมหน้าแรกเสมอ (พ่วงกับ /api/mail/messages) — rail
    // ห้ามยิงเองมาเบียด · fallback ไกล ๆ ไว้เผื่อรายการโหลดพัง · หน้าอื่น (/rules, /account) ยิงเองทันที
    const t = setTimeout(
      () => {
        if (!gotEventRef.current) void fetchSelf();
      },
      onWorkspacePage ? 8000 : 0,
    );
    return () => {
      clearTimeout(t);
      window.removeEventListener("mail:mailboxes", onMailboxes);
      window.removeEventListener("mail:folders-changed", onFoldersChanged);
    };
  }, [applyPayload, fetchSelf, onWorkspacePage]);

  const selector = resolveBoxSelector(searchParams.get("box"));
  const active = selector.kind === "system" ? selector.key : null;
  const activeFolderId = selector.kind === "folder" ? selector.mailboxId : null;
  // บนโดเมนเมล path จริงคือ "/" (middleware rewrite ไป /mail ให้) — ต้องรับทั้งสองแบบ
  const onMailbox = onWorkspacePage;

  return (
    <nav
      aria-label={t("shell.rail.aria")}
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 px-2 py-2 md:w-[200px] md:flex-col md:overflow-y-auto md:overflow-x-visible md:border-b-0 md:border-r md:px-2 md:py-3 [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      {MAIL_BOX_ORDER.map((key) => {
        const isActive = onMailbox && key === active;
        return (
          <Link
            key={key}
            href={key === "inbox" ? `${basePath}/` : `${basePath}/?box=${key}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-primary text-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
            )}
          >
            {BOX_ICON[key]}
            <span className="flex-1">{mailBoxLabel(key, locale)}</span>
            {!!unread[key] && (
              <span
                className={cn(
                  "shrink-0 text-xs font-medium tabular-nums",
                  isActive ? "text-white/80" : "text-gray-500",
                )}
              >
                {unread[key]}
              </span>
            )}
          </Link>
        );
      })}

      {/* โฟลเดอร์ของผู้ใช้ (M3) — ต่อท้ายกล่องระบบเสมอ ห้ามแทรกสลับกัน */}
      <div className="flex shrink-0 items-center gap-1 md:mt-3 md:border-t md:border-gray-200 md:px-1 md:pt-3">
        <span className="hidden flex-1 text-xs font-medium text-gray-400 md:block">
          {t("shell.rail.folders")}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          title={t("shell.rail.manageFolders")}
          aria-label={t("shell.rail.manageFolders")}
          onClick={() => setManageOpen(true)}
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>

      {folders.map((f) => {
        const isActive = onMailbox && f.id === activeFolderId;
        return (
          <Link
            key={f.id}
            href={`${basePath}/?box=${encodeURIComponent(folderBoxValue(f.id))}`}
            aria-current={isActive ? "page" : undefined}
            title={f.path}
            style={{ paddingInlineStart: 12 + f.depth * 12 }}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg py-2 pe-3 text-sm transition-colors",
              isActive
                ? "bg-primary text-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
            )}
          >
            <Folder className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{f.name}</span>
            {!!f.unreadCount && (
              <span
                className={cn(
                  "shrink-0 text-xs font-medium tabular-nums",
                  isActive ? "text-white/80" : "text-gray-500",
                )}
              >
                {f.unreadCount}
              </span>
            )}
          </Link>
        );
      })}

      <Link
        href={`${basePath}/rules`}
        aria-current={pathname === `${basePath}/rules` ? "page" : undefined}
        className={cn(
          "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors md:mt-2",
          pathname === `${basePath}/rules`
            ? "bg-primary text-white"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
        )}
      >
        <SlidersHorizontal className="h-4 w-4 shrink-0" />
        <span className="flex-1">{t("shell.rail.rules")}</span>
      </Link>

      <MailFoldersDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        folders={folders}
        onChanged={() => {
          // หน้ารายการ (ถ้าเปิดอยู่) จะโหลดชุดใหม่แล้วส่ง `mail:mailboxes` กลับมาให้ rail
          window.dispatchEvent(new Event("mail:folders-changed"));
        }}
      />
    </nav>
  );
}

export function MailShell({
  connected,
  basePath,
  locale,
  children,
}: {
  /** เชื่อมกล่องเมลแล้วหรือยัง — ยังไม่เชื่อมจะไม่มี rail (ยังไม่มีกล่องให้เปิด) */
  connected: boolean;
  /** `""` บนโดเมนเมล · `"/mail"` ที่อื่น — ห้ามฮาร์ดโค้ด (ดู lib/mail/base-path.ts) */
  basePath: string;
  /** ภาษาจาก cookie ตอน SSR (ดู `mail-locale.tsx`) */
  locale?: MailLocale;
  children: React.ReactNode;
}) {
  return (
    <MailLocaleProvider initialLocale={locale} connected={connected}>
      {/* ความสูงของ "หน้าจอ" เป็นของ shell ที่เดียว (h-dvh — ห้ามใช้ 100vh: Safari มือถือคืนค่าสูงเกินจริง)
    แล้วเนื้อหาข้างในใช้ h-full เอา — หน้าลูกห้ามเดา calc(100vh - Nrem) เพราะ rail มือถือกินสูงไม่เท่ากัน */}
      <div className="mail-zone flex h-dvh flex-col bg-white">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-3 sm:px-4">
          <MailBrand />
          {connected && <MailAccountMenu basePath={basePath} />}
        </header>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {connected && <MailRail basePath={basePath} />}
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-2 sm:px-4">
            {children}
          </main>
        </div>
      </div>
    </MailLocaleProvider>
  );
}
