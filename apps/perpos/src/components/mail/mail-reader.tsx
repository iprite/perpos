"use client";

/**
 * MailReader — บานอ่านเมล (MAIL_UI_SPEC §2 · contract §6.2)
 *
 * 🔴 กฎความปลอดภัยที่ห้ามผ่อนเด็ดขาด (contract §7.2):
 *    HTML ของเมลแสดงใน <iframe srcDoc> ที่ **ห้ามมี `allow-same-origin` เด็ดขาด**
 *    (ค่า sandbox/CSP อยู่ที่ lib/mail/srcdoc.ts ที่เดียว — ห้ามคัดลอกมาไว้ที่นี่)
 *    srcDoc ใส่ <meta http-equiv="Content-Security-Policy"> เป็นบรรทัดแรกของ <head> เสมอ
 *    — CSP คือด่านจริงของการบล็อกรูปนอกและสคริปต์ (DOM strip เป็นชั้นรอง)
 *    ความสูงมาจากสคริปต์ของเราใน frame ที่ postMessage กลับ — **ตรวจ `event.source` เสมอ**
 *
 * เธรด: กางเฉพาะฉบับล่าสุด · ฉบับอื่นยุบเป็นบรรทัดเดียว
 *  - ยุบ/กางด้วย CSS grid (grid-rows-[0fr] ⇄ [1fr] + overflow-hidden) ไม่วัดความสูง
 *  - **lazy mount**: ฉบับที่ยุบอยู่ต้องไม่มี iframe ใน DOM (เธรด 50 ฉบับ = เบราว์เซอร์ตาย)
 *  - "แสดงรูป" ผูกกับ message id เดียว ห้ามเป็น state รวมทั้งเธรด
 */

import { hasMailSubject } from "@/lib/mail/boxes";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Archive,
  ChevronLeft,
  CornerUpLeft,
  CornerUpRight,
  ReplyAll,
  Download,
  Eye,
  Filter,
  FolderInput,
  ImageOff,
  Mail,
  Maximize2,
  Minimize2,
  MoreVertical,
  Paperclip,
  Printer,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { MailRuleDialog, type MailRuleSeed } from "@/components/mail/mail-rule-dialog";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Popover } from "@/components/ui/popover";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Title, Text } from "@/components/ui/typography";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MailAttachmentPreview,
  mailAttachmentUrl,
} from "@/components/mail/mail-attachment-preview";
import { notify } from "@/lib/toast";
import { useMailLocale, useMailT } from "@/components/mail/mail-locale";
import type {
  MailAddress,
  MailAttachment,
  MailFolder,
  MailMessageDetail,
  MailThreadDetail,
} from "@/lib/mail/types";
import { formatMailDateTime, formatMailSize, mailDisplayName } from "@/lib/mail/format";
import { highlightHtml } from "@/lib/mail/highlight";
import {
  MAIL_HEIGHT_MESSAGE,
  MAIL_HEIGHT_PING,
  MAIL_LINK_MESSAGE,
  MAIL_PRINT_MESSAGE,
  MAIL_SCROLL_MESSAGE,
  MAIL_IFRAME_FALLBACK_HEIGHT,
  MAIL_IFRAME_MAX_HEIGHT,
  MAIL_IFRAME_MIN_HEIGHT,
  MAIL_IFRAME_SANDBOX,
  buildMailSrcdoc,
} from "@/lib/mail/srcdoc";

function addressList(list: MailAddress[]): string {
  if (!list.length) return "—";
  return list.map((a) => (a.name?.trim() ? `${a.name} <${a.email}>` : a.email)).join(", ");
}

/**
 * "ตอนนี้ผู้ใช้กำลังลากตัวแบ่งอยู่" — ส่งลงมาจาก `MailWorkspace`
 *
 * ระหว่างลาก การ์ดเมลต้อง **หยุดวัด/หยุดคิดโหมดย่อ** ทั้งหมด ไม่งั้นได้ลูป:
 * กรอบเปลี่ยนความกว้าง → เอกสารใน iframe reflow → สคริปต์ข้างในส่งความสูง/ความกว้างใหม่
 * → กรอบนอกเปลี่ยนความสูง + สลับโหมดย่อ → reflow อีก … วนทุกเฟรมจนเห็นเป็นเนื้อหากระพริบ
 * (Roundcube ไม่เจอปัญหานี้เพราะ iframe ของเขาสูงเท่ากรอบและไม่มีโหมดย่อ — เราเลือกทางที่
 *  สูงตามเนื้อหา+ย่อพอดีกรอบ จึงต้องกันลูปเอง)
 */
export const MailPaneResizeContext = createContext(false);

export interface MailReaderProps {
  detail: MailThreadDetail | null;
  loading: boolean;
  error: string | null;
  /** ฉบับล่าสุดในเธรดติดดาวอยู่ไหม (สถานะมาจากรายการ) */
  flagged: boolean;
  /** ยืนอยู่ในกล่องคลังเก็บ/ถังขยะแล้ว = ปุ่มนั้นไม่มีผล ห้ามแสดง (contract §6) */
  canArchive?: boolean;
  canTrash?: boolean;
  onRetry: () => void;
  onBack: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onToggleStar: () => void;
  /**
   * บานอ่าน "ยืนเดี่ยว" — กินพื้นที่ทั้งหมดโดยไม่มีรายการอยู่ข้าง ๆ (มุมมองรายการ / จอแคบ)
   * มีผล 2 อย่างที่มาจากเหตุผลเดียวกัน:
   *  1. ต้องเห็นปุ่ม "กลับไปรายการ" เสมอ — ไม่งั้นเปิดเมลแล้วออกไม่ได้นอกจากกด Esc (ผู้ใช้ไม่รู้)
   *  2. คอลัมน์เนื้อหากว้างขึ้น — ค่า `max-w-3xl` ตั้งไว้ตอนบานอ่านแบ่งจอกับรายการ
   *     พอกินเต็มจอแล้วยังคับเท่าเดิม จะเหลือขอบขาวสองข้างเป็นบริเวณกว้าง
   */
  standalone?: boolean;
  /** คำนำหน้าลิงก์ของโซนเมล (invariant ข้อ 0) — ส่งต่อให้กล่องสร้างกฎกรอง */
  basePath: string;
  /** โฟลเดอร์ที่กำลังเปิดอยู่ (ถ้าเป็นของผู้ใช้เอง) = ปลายทางที่เดาให้ตอนสร้างกฎ */
  currentFolderId?: string | null;
  /**
   * แจ้งว่าเป็น/ไม่เป็นสแปม — ส่งมาแค่ตัวที่ใช้ได้ในกล่องที่ยืนอยู่
   * (อยู่ในจดหมายขยะ = "ไม่ใช่สแปม" · กล่องอื่น = "นี่คือสแปม")
   * นอกจากย้ายกล่องแล้ว ยังเป็น**สัญญาณสอนตัวกรอง**ของเมลเซิร์ฟเวอร์ด้วย
   */
  onMarkSpam?: () => void;
  onNotSpam?: () => void;
  /** M3 — โฟลเดอร์ที่ย้ายไปได้ (ว่าง = ยังไม่มีโฟลเดอร์ ⇒ ไม่แสดงปุ่ม) */
  moveTargets?: MailFolder[];
  onMove?: (folder: MailFolder) => void;
  /** M2 — เปิดกล่องเขียนโดยเติมค่าจากฉบับล่าสุดในเธรด */
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
}

export function MailReader({
  detail,
  loading,
  error,
  flagged,
  canArchive = true,
  canTrash = true,
  standalone = false,
  basePath,
  currentFolderId = null,
  onMarkSpam,
  onNotSpam,
  onRetry,
  onBack,
  onArchive,
  onTrash,
  onToggleStar,
  moveTargets = [],
  onMove,
  onReply,
  onReplyAll,
  onForward,
}: MailReaderProps) {
  const t = useMailT();
  if (loading) return <ReaderSkeleton onBack={onBack} standalone={standalone} />;

  if (error) {
    return (
      <ReaderCenter
        icon={<Mail className="h-8 w-8 text-gray-400" />}
        title={t("reader.error.title")}
        description={error}
        action={
          <Button size="sm" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  if (!detail) {
    return (
      <ReaderCenter
        icon={<Mail className="h-8 w-8 text-gray-400" />}
        title={t("reader.empty.title")}
        description={t("reader.empty.desc")}
      />
    );
  }

  return (
    <ThreadView
      detail={detail}
      flagged={flagged}
      canArchive={canArchive}
      canTrash={canTrash}
      standalone={standalone}
      basePath={basePath}
      currentFolderId={currentFolderId}
      onMarkSpam={onMarkSpam}
      onNotSpam={onNotSpam}
      onBack={onBack}
      onArchive={onArchive}
      onTrash={onTrash}
      onToggleStar={onToggleStar}
      moveTargets={moveTargets}
      onMove={onMove}
      onReply={onReply}
      onReplyAll={onReplyAll}
      onForward={onForward}
    />
  );
}

function ThreadView({
  detail,
  flagged,
  canArchive,
  canTrash,
  standalone,
  basePath,
  currentFolderId,
  onMarkSpam,
  onNotSpam,
  onBack,
  onArchive,
  onTrash,
  onToggleStar,
  moveTargets,
  onMove,
  onReply,
  onReplyAll,
  onForward,
}: {
  detail: MailThreadDetail;
  flagged: boolean;
  canArchive: boolean;
  canTrash: boolean;
  standalone: boolean;
  basePath: string;
  currentFolderId: string | null;
  onMarkSpam?: () => void;
  onNotSpam?: () => void;
  onBack: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onToggleStar: () => void;
  moveTargets: MailFolder[];
  onMove?: (folder: MailFolder) => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
}) {
  const t = useMailT();
  const messages = detail.messages;
  const latestId = messages.length ? messages[messages.length - 1]!.id : null;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(latestId ? [latestId] : []));
  const latestRef = useRef<HTMLDivElement>(null);

  // เปิดเธรดใหม่ → กางเฉพาะฉบับล่าสุดเสมอ
  useEffect(() => {
    setExpanded(new Set(latestId ? [latestId] : []));
  }, [detail.threadId, latestId]);

  // เธรดเกิน 5 ฉบับ → เลื่อนไปฉบับล่าสุดให้อัตโนมัติ
  useEffect(() => {
    if (messages.length > 5) {
      latestRef.current?.scrollIntoView({ block: "start" });
    }
  }, [detail.threadId, messages.length]);

  /**
   * ค้นในเมล — ⌘F ของเบราว์เซอร์หาข้อความใน iframe ไม่เจอ (คนละเอกสาร)
   * ⇒ ต้องมีช่องค้นของเราเอง ไม่งั้นเมลยาว ๆ หาอะไรไม่เจอเลย
   */
  const [findOpen, setFindOpen] = useState(false);
  /** เมนู ⋯ ของมือถือ (ปุ่มที่ยุบเข้ามาเพราะแถวเดียวใส่ไม่หมด) */
  const [moreOpen, setMoreOpen] = useState(false);
  const [findInput, setFindInput] = useState("");
  const [findTerm, setFindTerm] = useState("");
  const [hitIndex, setHitIndex] = useState(0);
  const [hitCounts, setHitCounts] = useState<Record<string, number>>({});
  const findRef = useRef<HTMLInputElement>(null);

  // หน่วงคำค้น — ประกอบ srcdoc ใหม่ทุกตัวอักษรจะกระตุก
  useEffect(() => {
    const t = setTimeout(() => setFindTerm(findInput.trim()), 220);
    return () => clearTimeout(t);
  }, [findInput]);

  // เปลี่ยนเธรด/เปลี่ยนคำค้น → เริ่มนับใหม่เสมอ
  useEffect(() => {
    setHitIndex(0);
  }, [findTerm, detail.threadId]);
  useEffect(() => {
    setFindOpen(false);
    setFindInput("");
    setHitCounts({});
  }, [detail.threadId]);

  const onHitCount = useCallback((id: string, count: number) => {
    setHitCounts((prev) => (prev[id] === count ? prev : { ...prev, [id]: count }));
  }, []);

  /** แปลงลำดับรวมทั้งเธรด → (ฉบับไหน, ลำดับที่เท่าไรในฉบับนั้น) */
  const totalHits = messages.reduce((sum, m) => sum + (hitCounts[m.id] ?? 0), 0);
  const localActive = useMemo(() => {
    const map: Record<string, number> = {};
    let seen = 0;
    for (const m of messages) {
      const n = hitCounts[m.id] ?? 0;
      map[m.id] = hitIndex >= seen && hitIndex < seen + n ? hitIndex - seen : -1;
      seen += n;
    }
    return map;
  }, [messages, hitCounts, hitIndex]);

  const stepHit = useCallback(
    (delta: number) => {
      if (totalHits === 0) return;
      setHitIndex((i) => (i + delta + totalHits) % totalHits);
    },
    [totalHits],
  );

  /**
   * สร้างกฎกรองจากฉบับที่กำลังอ่าน — ใช้ **ฉบับล่าสุดในเธรด** (ฉบับที่กางอยู่)
   * ไม่ใช่ฉบับแรก เพราะเธรดยาว ๆ ผู้ส่งคนแรกมักไม่ใช่คนที่ผู้ใช้อยากกรอง
   */
  const [ruleOpen, setRuleOpen] = useState(false);
  const ruleSeed: MailRuleSeed | null = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last?.from?.email) return null;
    return { fromEmail: last.from.email, fromName: last.from.name, subject: detail.subject ?? "" };
  }, [messages, detail.subject]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("reader.back")}
          title={t("reader.back.title")}
          className={cn("shrink-0", !standalone && "lg:hidden")}
          onClick={onBack}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Title as="h2" className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900">
          {hasMailSubject(detail.subject) ? detail.subject.trim() : t("reader.noSubject")}
        </Title>
        {/* จอ ≥sm: ปุ่มครบทั้งแถว */}
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          <Button
            variant={findOpen ? "secondary" : "ghost"}
            size="icon"
            title={t("reader.find")}
            aria-label={t("reader.find")}
            aria-pressed={findOpen}
            onClick={() => {
              setFindOpen((v) => !v);
              if (!findOpen) setTimeout(() => findRef.current?.focus(), 30);
            }}
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t("reader.star.title")}
            aria-label={t("reader.star")}
            aria-pressed={flagged}
            onClick={onToggleStar}
          >
            <Star className={cn("h-4 w-4", flagged && "fill-amber-400 text-amber-500")} />
          </Button>
          {onMarkSpam && (
            <Button
              variant="ghost"
              size="icon"
              title={t("reader.spam.title")}
              aria-label={t("reader.spam")}
              onClick={onMarkSpam}
            >
              <ShieldAlert className="h-4 w-4" />
            </Button>
          )}
          {onNotSpam && (
            <Button
              variant="ghost"
              size="icon"
              title={t("reader.notSpam.title")}
              aria-label={t("reader.notSpam")}
              onClick={onNotSpam}
            >
              <ShieldCheck className="h-4 w-4" />
            </Button>
          )}
          {ruleSeed && (
            <Button
              variant="ghost"
              size="icon"
              title={t("reader.rule")}
              aria-label={t("reader.rule")}
              onClick={() => setRuleOpen(true)}
            >
              <Filter className="h-4 w-4" />
            </Button>
          )}
          {moveTargets.length > 0 && onMove && (
            <Dropdown
              label={t("reader.move")}
              placement="bottom-end"
              className="h-9"
              minWidth={220}
              leadingIcon={<FolderInput className="h-4 w-4" />}
              items={moveTargets.map((f) => ({
                key: f.id,
                label: f.path,
                onClick: () => onMove(f),
              }))}
            />
          )}
          {canArchive && (
            <Button
              variant="ghost"
              size="icon"
              title={t("reader.archive.title")}
              aria-label={t("reader.archive")}
              onClick={onArchive}
            >
              <Archive className="h-4 w-4" />
            </Button>
          )}
          {/* ปุ่มลบต้องไม่ "หน้าตาเหมือนเพื่อนบ้าน" — เคยคลิกพลาดจนเมลตกถังขยะตอนเทส
              → คั่นด้วยเส้น + เว้นระยะ + ใช้ variant outline โทนแดง (ไม่ใช่ ghost เหมือนอีก 2 ปุ่ม) */}
          {canTrash && (
            <>
              <span aria-hidden className="mx-1 h-5 w-px bg-gray-200" />
              <Button
                variant="outline"
                size="icon"
                title={t("reader.trash.title")}
                aria-label={t("reader.trash")}
                className="border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                onClick={onTrash}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* มือถือ: แถวเดียวใส่ปุ่มไม่หมด — เหลือของที่ใช้บ่อยที่สุด (เก็บ/ลบ) ที่เหลือยุบเข้าเมนู ⋯
            เดิมปุ่มล้นออกนอกจอจนกดลบไม่ได้ (แถบนี้ไม่ได้เลื่อนแนวนอน) */}
        <div className="flex shrink-0 items-center gap-1 sm:hidden">
          {canArchive && (
            <Button
              variant="ghost"
              size="icon"
              title={t("reader.archive.title")}
              aria-label={t("reader.archive")}
              onClick={onArchive}
            >
              <Archive className="h-4 w-4" />
            </Button>
          )}
          {canTrash && (
            <Button
              variant="outline"
              size="icon"
              title={t("reader.trash.title")}
              aria-label={t("reader.trash")}
              className="border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              onClick={onTrash}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Popover
            placement="bottom-end"
            open={moreOpen}
            onOpenChange={setMoreOpen}
            triggerClassName="shrink-0"
            trigger={
              <button
                type="button"
                aria-label={t("reader.more")}
                title={t("reader.more")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            }
          >
            <div className="max-h-[70vh] min-w-[220px] overflow-y-auto py-1">
              <MoreMenuItem
                icon={<Search className="h-4 w-4" />}
                label={t("reader.find")}
                onClick={() => {
                  setMoreOpen(false);
                  setFindOpen(true);
                  setTimeout(() => findRef.current?.focus(), 30);
                }}
              />
              <MoreMenuItem
                icon={
                  <Star className={cn("h-4 w-4", flagged && "fill-amber-400 text-amber-500")} />
                }
                label={flagged ? t("reader.unstar") : t("reader.star")}
                onClick={() => {
                  setMoreOpen(false);
                  onToggleStar();
                }}
              />
              {onMarkSpam && (
                <MoreMenuItem
                  icon={<ShieldAlert className="h-4 w-4" />}
                  label={t("reader.spam")}
                  onClick={() => {
                    setMoreOpen(false);
                    onMarkSpam();
                  }}
                />
              )}
              {onNotSpam && (
                <MoreMenuItem
                  icon={<ShieldCheck className="h-4 w-4" />}
                  label={t("reader.notSpam")}
                  onClick={() => {
                    setMoreOpen(false);
                    onNotSpam();
                  }}
                />
              )}
              {ruleSeed && (
                <MoreMenuItem
                  icon={<Filter className="h-4 w-4" />}
                  label={t("reader.rule")}
                  onClick={() => {
                    setMoreOpen(false);
                    setRuleOpen(true);
                  }}
                />
              )}
              {moveTargets.length > 0 && onMove && (
                <>
                  <div className="mt-1 border-t border-gray-100 px-3 pb-1 pt-2 text-xs font-medium text-gray-400">
                    {t("reader.move")}
                  </div>
                  {moveTargets.map((f) => (
                    <MoreMenuItem
                      key={f.id}
                      icon={<FolderInput className="h-4 w-4" />}
                      label={f.path}
                      onClick={() => {
                        setMoreOpen(false);
                        onMove(f);
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          </Popover>
        </div>
      </div>

      <MailRuleDialog
        open={ruleOpen}
        onOpenChange={setRuleOpen}
        seed={ruleSeed}
        basePath={basePath}
        defaultMailboxId={currentFolderId}
      />

      {findOpen && (
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <Input
            ref={findRef}
            value={findInput}
            onChange={(e) => setFindInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                stepHit(e.shiftKey ? -1 : 1);
              }
              if (e.key === "Escape") setFindOpen(false);
            }}
            placeholder={t("reader.find")}
            className="h-8 min-w-0 flex-1"
          />
          {/* ต้องบอกจำนวนเสมอ — ไม่มีตัวเลข ผู้ใช้ไม่รู้ว่า "ไม่เจอ" หรือ "ยังไม่ได้หา" */}
          <span className="shrink-0 text-xs tabular-nums text-gray-500">
            {findTerm
              ? totalHits
                ? `${hitIndex + 1}/${totalHits}`
                : t("reader.find.notFound")
              : ""}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={totalHits === 0}
            title={t("reader.find.prev.title")}
            aria-label={t("reader.find.prev")}
            onClick={() => stepHit(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={totalHits === 0}
            title={t("reader.find.next.title")}
            aria-label={t("reader.find.next")}
            onClick={() => stepHit(1)}
          >
            <ChevronLeft className="h-4 w-4 rotate-180" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            title={t("reader.find.close.title")}
            aria-label={t("reader.find.close")}
            onClick={() => setFindOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn("mx-auto w-full px-3 py-4 sm:px-5", standalone ? "max-w-5xl" : "max-w-3xl")}
        >
          {/* เธรดยาวถูกตัดให้เหลือฉบับล่าสุด — ต้องบอกผู้ใช้ ห้ามหายเงียบ */}
          {detail.totalMessages > messages.length && (
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <Text className="text-xs text-gray-500">
                {t("reader.thread.truncated", {
                  total: detail.totalMessages,
                  shown: messages.length,
                })}
              </Text>
            </div>
          )}
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={m.id} ref={i === messages.length - 1 ? latestRef : undefined}>
                <MessageCard
                  message={m}
                  open={expanded.has(m.id)}
                  onToggle={() => toggle(m.id)}
                  findTerm={findTerm}
                  activeHit={localActive[m.id] ?? -1}
                  onHitCount={onHitCount}
                />
              </div>
            ))}
          </div>

          {/* ปุ่มตอบอยู่ท้ายเธรด = ตำแหน่งที่สายตาอยู่พอดีหลังอ่านจบ (คีย์ลัด r / a / f ทำอย่างเดียวกัน) */}
          <div className="mt-4 hidden flex-wrap gap-2 sm:flex">
            <Button variant="outline" size="sm" onClick={onReply} title={t("reader.reply.title")}>
              <CornerUpLeft className="h-4 w-4" />
              {t("reader.reply")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onReplyAll}
              title={t("reader.replyAll.title")}
            >
              <ReplyAll className="h-4 w-4" />
              {t("reader.replyAll")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onForward}
              title={t("reader.forward.title")}
            >
              <CornerUpRight className="h-4 w-4" />
              {t("reader.forward")}
            </Button>
          </div>
        </div>
      </div>

      {/* มือถือ: แถบตอบกลับติดขอบล่าง — เมลยาว ๆ ไม่ต้องเลื่อนลงไปสุดเพื่อหาปุ่มตอบ
          (ท่าเดียวกับ Gmail/Outlook บนมือถือ) · จอ ≥sm ใช้ปุ่มท้ายเธรดเหมือนเดิม */}
      <div className="flex shrink-0 items-center gap-2 border-t border-gray-200 bg-white px-3 py-2 sm:hidden">
        <Button
          variant="outline"
          size="sm"
          className="min-w-0 flex-1"
          onClick={onReply}
          title={t("reader.reply.title")}
        >
          <CornerUpLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">{t("reader.reply")}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-w-0 flex-1"
          onClick={onReplyAll}
          title={t("reader.replyAll.title")}
        >
          <ReplyAll className="h-4 w-4 shrink-0" />
          <span className="truncate">{t("reader.replyAll")}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-w-0 flex-1"
          onClick={onForward}
          title={t("reader.forward.title")}
        >
          <CornerUpRight className="h-4 w-4 shrink-0" />
          <span className="truncate">{t("reader.forward")}</span>
        </Button>
      </div>
    </div>
  );
}

/** แถวหนึ่งของเมนู ⋯ บนมือถือ — สูง 44px ตามเกณฑ์เป้านิ้ว (py-3 + text-sm) */
function MoreMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-3 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
    >
      <span className="shrink-0 text-gray-500">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

/**
 * จำความสูงที่วัดได้ของแต่ละฉบับไว้ข้ามการเปิด-ปิด
 *
 * ทำไมต้องมี: `srcdoc` เริ่มที่ค่าตั้งต้นแล้วค่อยเด้งเป็นค่าจริงเมื่อสคริปต์วัดตอบกลับ (~100ms)
 * ⇒ เปิดเมลเดิมซ้ำก็กระตุกทุกครั้ง · เก็บค่าล่าสุดไว้แล้วใช้เป็นค่าเริ่มต้น จอจึงนิ่งตั้งแต่เฟรมแรก
 * (แค่แคชในหน่วยความจำของแท็บ ไม่ต้องคงทน — รีโหลดแล้วเริ่มใหม่ได้ไม่เสียหาย)
 */
const heightCache = new Map<string, number>();

/** โดเมนของลิงก์ — ส่วนที่ต้องอ่านก่อนตัดสินใจคลิก (URL พังก็คืนค่าเดิมไปเลย ดีกว่าไม่บอกอะไร) */
function linkHost(href: string): string {
  try {
    return new URL(href).host || href;
  } catch {
    return href;
  }
}

/** เดาความสูงจากความยาวข้อความ — ใกล้ของจริงกว่าค่าคงที่ 320px มาก สำหรับฉบับที่ยังไม่เคยวัด */
function estimateHeight(message: MailMessageDetail): number {
  const chars = message.textBody?.length ?? 0;
  const guess = Math.ceil(chars / 80) * 22 + 120;
  return Math.min(Math.max(guess, MAIL_IFRAME_MIN_HEIGHT), 1200);
}

function MessageCard({
  message,
  open,
  onToggle,
  findTerm,
  activeHit,
  onHitCount,
}: {
  message: MailMessageDetail;
  open: boolean;
  onToggle: () => void;
  /** คำค้นในเมล (หน่วงมาแล้ว) — ว่าง = ไม่ไฮไลต์ */
  findTerm: string;
  /** ลำดับคำที่กำลังโฟกัสภายในฉบับนี้ · -1 = ไม่มีตัวไหนโฟกัสอยู่ */
  activeHit: number;
  onHitCount: (id: string, count: number) => void;
}) {
  const { locale, t } = useMailLocale();
  const [imagesHtml, setImagesHtml] = useState<string | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const [preview, setPreview] = useState<MailAttachment | null>(null);
  /** ลิงก์ที่เมาส์/โฟกัสอยู่ใน frame — แถบบอกปลายทางกันคลิกลิงก์ปลอม */
  const [hoverLink, setHoverLink] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  /** ความกว้างเนื้อหาจริงใน frame กับความกว้างกรอบที่มี — ใช้ตัดสินว่าต้องย่อไหม */
  const [contentWidth, setContentWidth] = useState(0);
  const [paneWidth, setPaneWidth] = useState(0);
  const [fitOverride, setFitOverride] = useState<boolean | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  /** กำลังลากตัวแบ่งอยู่ไหม — เก็บเป็น ref ด้วยเพราะ listener/observer อ่านค่าตอนถูกเรียก */
  const resizing = useContext(MailPaneResizeContext);
  const resizingRef = useRef(resizing);
  useEffect(() => {
    resizingRef.current = resizing;
  }, [resizing]);

  const showImages = useCallback(async () => {
    setLoadingImages(true);
    try {
      const res = await fetch(
        `/api/mail/messages/${encodeURIComponent(message.id)}?by=email&images=1`,
      );
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg = (data as { message?: string })?.message ?? t("reader.images.failed");
        throw new Error(msg);
      }
      const found = (data as MailThreadDetail).messages?.find((x) => x.id === message.id);
      if (!found?.htmlSanitized) throw new Error(t("reader.images.notFound"));
      setImagesHtml(found.htmlSanitized);
    } catch (e) {
      notify.error(e, t("reader.images.failed"));
    } finally {
      setLoadingImages(false);
    }
  }, [message.id, t]);

  const bodyHtml = imagesHtml ?? message.htmlSanitized;

  /**
   * nonce ของ CSP — **สุ่มใหม่ทุกครั้งที่ประกอบ srcdoc** ห้ามคงที่/เดาได้
   * (เดาได้เมื่อไร สคริปต์ที่หลุด sanitizer มาก็แนบ nonce เองแล้วรันได้)
   */
  /** ไฮไลต์คำค้นที่ชั้นสตริงก่อนประกอบ srcdoc — สคริปต์ใน frame ไม่แตะเนื้อหา (ดู highlight.ts) */
  const marked = useMemo(() => {
    if (!bodyHtml) return { html: null as string | null, count: 0 };
    if (!findTerm) return { html: bodyHtml, count: 0 };
    const r = highlightHtml(bodyHtml, findTerm, activeHit);
    return { html: r.html, count: r.count };
  }, [bodyHtml, findTerm, activeHit]);

  const hitCount = marked.count;
  useEffect(() => {
    onHitCount(message.id, open ? hitCount : 0);
  }, [message.id, hitCount, open, onHitCount]);

  const srcDoc = useMemo(() => {
    if (!marked.html) return null;
    return buildMailSrcdoc(marked.html, {
      showImages: !!imagesHtml,
      nonce: crypto.randomUUID().replaceAll("-", ""),
    });
  }, [marked.html, imagesHtml]);

  /**
   * ความสูงมาจากสคริปต์วัดข้างใน frame (`postMessage`) — ดูเหตุผลที่ต้องทำแบบนี้ใน `srcdoc.ts`
   *
   * 🔴 origin ของ frame เป็น `"null"` (sandbox ไม่มี allow-same-origin ตามที่ต้องเป็น)
   *    ⇒ ตรวจ origin ไม่ได้ **ต้องเทียบ `event.source` กับ contentWindow ของ frame เรา**
   *    ไม่งั้นหน้าอื่น/โฆษณาใน iframe ใดก็ยิงข้อความมาปรับความสูงเล่นได้
   */
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState<number>(
    () => heightCache.get(message.id) ?? estimateHeight(message),
  );

  useEffect(() => {
    if (!srcDoc) return;
    // ❌ ห้ามรีเซ็ตความสูงเป็นค่าตั้งต้นตรงนี้ — จอจะกระตุกทุกครั้งที่ประกอบ srcdoc ใหม่
    //    (เช่นตอนพิมพ์คำค้น) ให้คงค่าที่รู้อยู่แล้วไว้จนกว่าค่าจริงรอบใหม่จะมาถึง
    let done = false;

    const onMessage = (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      // ลากอยู่ = ไม่รับค่าที่วัดระหว่างทาง (ดู MailPaneResizeContext) — วัดใหม่ทีเดียวตอนปล่อยมือ
      if (resizingRef.current) return;
      const data = e.data as {
        type?: unknown;
        height?: unknown;
        width?: unknown;
        href?: unknown;
      } | null;
      if (!data) return;
      if (data.type === MAIL_LINK_MESSAGE) {
        setHoverLink(typeof data.href === "string" ? data.href : null);
        return;
      }
      if (data.type !== MAIL_HEIGHT_MESSAGE) return;
      if (typeof data.height !== "number" || !Number.isFinite(data.height)) return;
      done = true;
      const h = Math.min(
        Math.max(Math.ceil(data.height), MAIL_IFRAME_MIN_HEIGHT),
        MAIL_IFRAME_MAX_HEIGHT,
      );
      heightCache.set(message.id, h);
      setFrameHeight(h);
      if (typeof data.width === "number" && Number.isFinite(data.width)) {
        setContentWidth(Math.ceil(data.width));
      }
    };
    window.addEventListener("message", onMessage);

    /**
     * ถามซ้ำ — `srcdoc` เริ่มโหลดตั้งแต่ React แทรก iframe ลง DOM ซึ่งเกิด**ก่อน** effect นี้
     * ⇒ ความสูงใบแรกที่ frame ส่งมาหายเสมอถ้ารออย่างเดียว (เจอจริงตอนเทส ไม่ใช่ทฤษฎี)
     */
    const ping = () =>
      frameRef.current?.contentWindow?.postMessage({ type: MAIL_HEIGHT_PING }, "*");
    ping();
    const pings = [50, 200, 600, 1200].map((ms) => setTimeout(ping, ms));
    // วัดไม่สำเร็จใน 2 วิ (สคริปต์ถูกบล็อก/เบราว์เซอร์เก่า) → ใช้ความสูงสำรอง แล้วให้ frame เลื่อนในตัว
    const fallback = setTimeout(() => {
      if (!done && !heightCache.has(message.id)) setFrameHeight(MAIL_IFRAME_FALLBACK_HEIGHT);
    }, 2000);

    return () => {
      for (const t of pings) clearTimeout(t);
      clearTimeout(fallback);
      window.removeEventListener("message", onMessage);
    };
  }, [srcDoc, message.id]);

  /**
   * วัดความกว้างของกรอบจริง (ของเหนือ-ล่างยุบ/กางได้ ⇒ ต้องเฝ้า ไม่ใช่วัดครั้งเดียว)
   * — รวบหลายครั้งใน 1 เฟรมด้วย rAF และข้ามการเปลี่ยนที่ต่ำกว่า 2px (เศษจาก scrollbar/zoom)
   * — ระหว่างลากตัวแบ่ง ไม่วัดเลย (ค่าค้างไว้เท่าตอนก่อนเริ่มลาก)
   */
  useEffect(() => {
    const el = paneRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const w = el.clientWidth;
      setPaneWidth((prev) => (Math.abs(prev - w) < 2 ? prev : w));
    };
    const ro = new ResizeObserver(() => {
      if (resizingRef.current || raf) return;
      raf = requestAnimationFrame(measure);
    });
    ro.observe(el);
    measure();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [open]);

  /** ปล่อยมือจากตัวแบ่งแล้วค่อยวัดรอบเดียว (กรอบ + ถามความสูง/ความกว้างจาก frame ใหม่) */
  useEffect(() => {
    if (resizing) return;
    const el = paneRef.current;
    if (el) {
      const w = el.clientWidth;
      setPaneWidth((prev) => (Math.abs(prev - w) < 2 ? prev : w));
    }
    frameRef.current?.contentWindow?.postMessage({ type: MAIL_HEIGHT_PING }, "*");
  }, [resizing]);

  /**
   * ย่อให้พอดีกรอบ — เมลจากธนาคาร/จดหมายข่าวมักตรึงความกว้างไว้ 600–900px
   * กรอบเราแคบกว่านั้นบ่อย ⇒ ถ้าไม่ย่อ ต้องเลื่อนซ้าย-ขวาอ่านทีละครึ่ง
   *
   * เปิดให้เองเฉพาะตอนที่ย่อแล้ว **ยังอ่านออก** (ไม่ต่ำกว่า 60%) · กว้างเกินกว่านั้น
   * การย่อทำให้ตัวหนังสือเล็กจนอ่านไม่ได้ → ปล่อยให้เลื่อน หรือกด "เปิดเต็มหน้า" แทน
   */
  const overflowRatio = contentWidth > 0 && paneWidth > 0 ? paneWidth / contentWidth : 1;

  /**
   * เกณฑ์เข้า-ออกคนละค่า (hysteresis): เข้าโหมดย่อเมื่อกรอบแคบกว่าเนื้อหาจริง (<0.98)
   * แต่จะออกก็ต่อเมื่อกรอบกว้างพ้นเนื้อหาชัดเจนแล้ว (>1.02) — ใช้เกณฑ์เดียวกันทั้งเข้าและออก
   * เมื่อไร ความกว้างที่วนอยู่แถวเส้นแบ่งจะสลับโหมดกลับไปกลับมาไม่จบ (= กระพริบ)
   */
  const [autoFit, setAutoFit] = useState(false);
  useEffect(() => {
    if (!contentWidth || !paneWidth) return;
    const ratio = paneWidth / contentWidth;
    setAutoFit((prev) => {
      // ย่อแล้วตัวหนังสือเล็กจนอ่านไม่ออก → ปล่อยให้เลื่อนซ้าย-ขวา หรือกด "เปิดเต็มหน้า"
      if (ratio < 0.6) return false;
      return prev ? ratio < 1.02 : ratio < 0.98;
    });
  }, [contentWidth, paneWidth]);

  /** ปุ่มสลับต้องไม่หายวูบตอนกำลังย่ออยู่ ⇒ นับ autoFit เป็น "ย่อได้" ด้วย */
  const canFit = overflowRatio < 0.98 || autoFit;
  const fit = fitOverride ?? autoFit;
  const scale = fit ? Math.min(1, overflowRatio) : 1;

  /** โฟกัสคำค้นเปลี่ยน → บอก frame ให้เลื่อนไปหา (frame เลื่อนจออย่างเดียว ไม่แก้ DOM) */
  useEffect(() => {
    if (!srcDoc || activeHit < 0 || hitCount === 0) return;
    const t = setTimeout(
      () => frameRef.current?.contentWindow?.postMessage({ type: MAIL_SCROLL_MESSAGE }, "*"),
      60,
    );
    return () => clearTimeout(t);
  }, [srcDoc, activeHit, hitCount]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-gray-50",
          open && "border-b border-gray-100",
        )}
      >
        <Avatar name={mailDisplayName(message.from)} className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-gray-900">
              {mailDisplayName(message.from)}
            </span>
            {message.from?.name && (
              <span className="hidden truncate text-xs text-gray-400 sm:inline">
                &lt;{message.from.email}&gt;
              </span>
            )}
            <span className="ms-auto shrink-0 text-xs tabular-nums text-gray-500">
              {formatMailDateTime(message.receivedAt, locale)}
            </span>
          </div>
          {open ? (
            <div className="mt-0.5 space-y-0.5">
              <Text className="truncate text-xs text-gray-500">
                {t("reader.to", { list: addressList(message.to) })}
              </Text>
              {message.cc.length > 0 && (
                <Text className="truncate text-xs text-gray-500">
                  {t("reader.cc", { list: addressList(message.cc) })}
                </Text>
              )}
            </div>
          ) : (
            <Text className="mt-0.5 truncate text-xs text-gray-400">
              {message.textBody?.trim().slice(0, 140) || t("reader.expandHint")}
            </Text>
          )}
        </div>
      </div>

      {/* ยุบ/กางด้วย CSS grid — ไม่วัดความสูงเนื้อหา (เข้ากับกฎ iframe ที่ไม่มี allow-scripts) */}
      <div
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0">
          {/* lazy mount: ฉบับที่ยุบอยู่ ห้ามมี iframe ใน DOM */}
          {open && (
            <div className="px-4 py-3">
              {message.hasRemoteImages && !imagesHtml && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <ImageOff className="h-4 w-4 shrink-0 text-amber-600" />
                  <span className="text-xs text-amber-700">{t("reader.images.blocked")}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ms-auto"
                    disabled={loadingImages}
                    onClick={showImages}
                  >
                    {loadingImages ? t("reader.images.loading") : t("reader.images.show")}
                  </Button>
                </div>
              )}

              {srcDoc && (
                <div className="mb-2 flex flex-wrap justify-end gap-1">
                  {canFit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-gray-500"
                      onClick={() => setFitOverride(!fit)}
                      title={fit ? t("reader.fit.actualSize.title") : t("reader.fit.shrink.title")}
                    >
                      {fit ? (
                        <Maximize2 className="h-3.5 w-3.5" />
                      ) : (
                        <Minimize2 className="h-3.5 w-3.5" />
                      )}
                      {fit
                        ? t("reader.fit.actualSize", { percent: Math.round(scale * 100) })
                        : t("reader.fit.shrink")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-gray-500"
                    onClick={() =>
                      frameRef.current?.contentWindow?.postMessage(
                        { type: MAIL_PRINT_MESSAGE },
                        "*",
                      )
                    }
                    title={t("reader.print.title")}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    {t("reader.print")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-gray-500"
                    onClick={() => setFullscreen(true)}
                    title={t("reader.fullscreen")}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    {t("reader.fullscreen")}
                  </Button>
                  {/* ผลตรวจของเมลเซิร์ฟเวอร์ — มีเฉพาะฉบับที่มี header พวกนี้จริง */}
                  {message.securityHeaders.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-gray-500"
                      onClick={() => setShowSecurity(true)}
                      title={t("reader.security.title")}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {t("reader.security")}
                    </Button>
                  )}
                </div>
              )}

              {srcDoc ? (
                /* โหมดย่อ: ตั้งความกว้าง frame เท่าเนื้อหาจริงแล้ว scale ทั้งก้อน
                   — ไม่แตะ DOM ของเมล และกรอบนอกสูงเท่าที่ย่อแล้วจริง (ไม่เหลือช่องว่าง) */
                <div
                  ref={paneRef}
                  className="overflow-hidden rounded-lg border border-gray-100 bg-white"
                  style={fit ? { height: Math.ceil(frameHeight * scale) } : undefined}
                >
                  <iframe
                    ref={frameRef}
                    title={t("reader.frame.title")}
                    // 🔴 ห้ามเติม allow-same-origin เด็ดขาด (contract §7.2 · มีเทสจับ)
                    sandbox={MAIL_IFRAME_SANDBOX}
                    srcDoc={srcDoc}
                    referrerPolicy="no-referrer"
                    onLoad={() =>
                      frameRef.current?.contentWindow?.postMessage({ type: MAIL_HEIGHT_PING }, "*")
                    }
                    // ยังไม่รู้ความสูง = ใช้ค่าตั้งต้นไปก่อน (จอไม่กระโดดตอนค่าจริงมาถึงใน ~100ms)
                    style={
                      fit
                        ? {
                            width: contentWidth || "100%",
                            height: frameHeight,
                            transform: `scale(${scale})`,
                            transformOrigin: "top left",
                          }
                        : { height: frameHeight }
                    }
                    className={cn("bg-white", !fit && "w-full")}
                  />
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-700">
                  {message.textBody?.trim() || t("reader.noBody")}
                </pre>
              )}

              {message.attachments.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
                  {message.attachments.map((a) => (
                    <div
                      key={a.blobId}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2"
                    >
                      <Paperclip className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                        {a.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-gray-500">
                        {formatMailSize(a.sizeBytes)}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setPreview(a)}>
                        <Eye className="h-4 w-4" />
                        {t("reader.attachment.view")}
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={mailAttachmentUrl(a, true)} download={a.name}>
                          <Download className="h-4 w-4" />
                          {t("reader.attachment.download")}
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* แถบบอกปลายทางของลิงก์ — เบราว์เซอร์ไม่ขึ้นให้เองเพราะลิงก์อยู่ในเอกสารคนละใบ
          โดเมนตัวหนาก่อนเสมอ: คนอ่านโดเมนก่อน ไม่ใช่ path (ฟิชชิงชอบซ่อนโดเมนจริงไว้ท้าย URL) */}
      {open && hoverLink && (
        <div className="flex items-center gap-2 border-t border-gray-100 bg-gray-50 px-4 py-1.5">
          <span className="shrink-0 text-[11px] text-gray-400">{t("reader.link.goto")}</span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-gray-500">
            <span className="font-semibold text-gray-700">{linkHost(hoverLink)}</span>
            <span className="ms-1">{hoverLink}</span>
          </span>
        </div>
      )}

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent size="full">
          <DialogHeader>
            <DialogTitle className="truncate">
              {hasMailSubject(message.subject) ? message.subject.trim() : t("reader.noSubject")}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="p-0">
            <Dialog open={showSecurity} onOpenChange={setShowSecurity}>
              <DialogContent size="xl">
                <DialogHeader>
                  <DialogTitle>{t("reader.security.dialogTitle")}</DialogTitle>
                </DialogHeader>
                <DialogBody>
                  {/* แสดงดิบตามที่เมลเซิร์ฟเวอร์เขียนไว้ — ไม่ตีความ/ไม่สรุปแทน
                (รูปแบบต่างกันตามผู้ส่ง สรุปผิดแล้วผู้ใช้ตัดสินใจผิดเรื่องความปลอดภัย) */}
                  <div className="space-y-3">
                    {message.securityHeaders.map((h) => (
                      <div key={h.name}>
                        <div className="text-xs font-medium text-gray-500">{h.name}</div>
                        <pre className="mt-1 whitespace-pre-wrap break-all rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                          {h.value}
                        </pre>
                      </div>
                    ))}
                  </div>
                </DialogBody>
              </DialogContent>
            </Dialog>

            {/* iframe คนละตัวกับในการ์ด แต่ sandbox/CSP ชุดเดียวกันเป๊ะ (srcDoc เดิม)
                ไม่ต้องวัดความสูง — ให้เนื้อหาเลื่อนในกรอบเต็มจอเอง */}
            {srcDoc && (
              <iframe
                title={t("reader.frame.fullscreenTitle")}
                sandbox={MAIL_IFRAME_SANDBOX}
                srcDoc={srcDoc}
                referrerPolicy="no-referrer"
                className="h-[80vh] w-full bg-white"
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <MailAttachmentPreview attachment={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function ReaderCenter({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-white px-6 py-16 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-4">{icon}</div>
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function ReaderSkeleton({ onBack, standalone }: { onBack: () => void; standalone: boolean }) {
  const t = useMailT();
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("reader.back")}
          className={cn("shrink-0", !standalone && "lg:hidden")}
          onClick={onBack}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Skeleton className="h-5 w-2/3" />
      </div>
      <div className={cn("mx-auto w-full px-5 py-5", standalone ? "max-w-5xl" : "max-w-3xl")}>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <SkeletonText lines={4} className="mt-6" />
      </div>
    </div>
  );
}
