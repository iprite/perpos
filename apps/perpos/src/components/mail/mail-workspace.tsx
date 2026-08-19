"use client";

/**
 * MailWorkspace — หน้าอ่านเมล 2 pane (MAIL_UI_SPEC §2 · contract §6)
 *
 * ทำไม data fetch อยู่ที่ client ไม่ใช่ SSR (ข้อยกเว้นที่ตั้งใจจาก page-load standard):
 *   การ refresh token ต้อง **เขียน cookie** ซึ่ง server component ทำไม่ได้ระหว่าง render
 *   → หน้า /mail SSR แค่ shell + สถานะเชื่อมต่อ แล้ว component นี้ยิง /api/mail/* ต่อ
 *   (loading.tsx + skeleton ตาม UI_SPEC §9 ยังบังคับเหมือนเดิม — ห้ามจอขาว/spinner กลางจอ)
 *
 * ลบ/เก็บเข้าคลัง = optimistic ผ่านคิว (contract §6.4):
 *   ซ่อนแถวทันที → <UndoToast> 8 วิ → กดเลิกทำ = คืนแถวโดยไม่เคยยิง API → ครบ 8 วิ ค่อยยิงจริง
 *   · flush คิวทันทีเมื่อกำลังจะออกจากหน้าจริง ๆ (`pagehide` + keepalive) — สลับแท็บไม่นับ
 *   · **ไม่ persist คิวลง storage** — หลังรีโหลดยึดสถานะจากเซิร์ฟเวอร์เสมอ
 */

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { HotkeysProvider } from "react-hotkeys-hook";
import { Archive, FolderInput, MailOpen, PenLine, Trash2 } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { notify } from "@/lib/toast";
import { UNDO_TOAST_MS, dismissUndoToast, showUndoToast } from "@/components/ui/undo-toast";
import { resolveBoxSelector } from "@/lib/mail/boxes";
import {
  MAIL_LIST_WIDTH_DEFAULT,
  MAIL_LIST_WIDTH_MAX,
  MAIL_LIST_WIDTH_MIN,
  cacheListWidth,
  cachePane,
  clampMailListWidth,
  readCachedListWidth,
  readCachedPane,
} from "@/lib/mail/prefs-storage";
import type {
  MailBoxKey,
  MailBulkAction,
  MailFolder,
  MailMessage,
  MailPaneMode,
  MailPrefs,
  MailScope,
  MailThreadDetail,
  MailboxSummary,
} from "@/lib/mail/types";
import { MailList, type MailListHandle } from "@/components/mail/mail-list";
import { MailPaneResizeContext, MailReader } from "@/components/mail/mail-reader";
import { MailToolbar, type MailFilters } from "@/components/mail/mail-toolbar";
import { MailShortcutsDialog } from "@/components/mail/mail-shortcuts-dialog";
import {
  MailCompose,
  type MailComposeSeed,
  type MailDraftPayload,
  type MailIdentityOption,
} from "@/components/mail/mail-compose";
import {
  buildForwardBody,
  buildQuotedReply,
  forwardSubject,
  replyRecipients,
  replySubject,
} from "@/lib/mail/compose";
import {
  MAIL_HOTKEY_SCOPE,
  useMailShortcuts,
  type MailShortcutHandlers,
} from "@/components/mail/use-mail-shortcuts";

/** เพดานรอบของการล้างกล่องต่อการกดหนึ่งครั้ง (รอบละ 200 ⇒ 4,000 ฉบับ) */
const EMPTY_MAX_ROUNDS = 20;

const PAGE_SIZE = 50;
const POLL_MS = 60_000;
/** เปิดค้างนานเท่านี้ถึงจะถือว่า "อ่านแล้ว" — กันกด j/k ผ่านแล้วสถานะหายถาวร */
const MARK_READ_DWELL_MS = 1_800;
const GENERIC_ERROR = "ระบบอีเมลไม่ตอบสนอง ลองใหม่อีกครั้ง";

class MailSessionExpiredError extends Error {
  constructor() {
    super("เซสชันกล่องเมลหมดอายุ");
  }
}

interface ListResponse {
  messages: MailMessage[];
  total: number | null;
  hasMore: boolean;
  queryState: string | null;
}

async function callMailApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) throw new MailSessionExpiredError();
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data as { message?: string } | null)?.message ?? GENERIC_ERROR;
    throw new Error(message);
  }
  return data as T;
}

function postJson<T>(url: string, body: unknown, keepalive = false): Promise<T> {
  return callMailApi<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive,
  });
}

type DestructiveAction = Extract<MailBulkAction, "archive" | "trash">;

interface QueueEntry {
  ids: string[];
  timer: ReturnType<typeof setTimeout>;
}

/** toast ของการส่งมีได้ใบเดียวเสมอ — ดูเหตุผลใน `enqueueSend` */
const SEND_TOAST_ID = "mail-send-undo";

const ACTION_LABEL: Record<DestructiveAction, string> = {
  archive: "เก็บเข้าคลังแล้ว",
  trash: "ย้ายไปถังขยะแล้ว",
};

export function MailWorkspace({
  box,
  boxLabel,
  basePath,
}: {
  /** คีย์ระบบ (`inbox`…) หรือ `f:<mailboxId>` ของโฟลเดอร์เอง — ดู `lib/mail/boxes.ts` */
  box: string;
  boxLabel: string;
  /** `""` บนโดเมนเมล · `"/mail"` ที่อื่น — ห้ามฮาร์ดโค้ด (ดู lib/mail/base-path.ts) */
  basePath: string;
}) {
  const router = useRouter();

  // ── รายการเมล ────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── ตัวกรอง / ค้นหา ──────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<MailFilters>({ unread: false, attachment: false });
  const [showFilters, setShowFilters] = useState(false);

  // ── สถานะการเลือก / เคอร์เซอร์ ───────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const lastSelectedIndexRef = useRef<number | null>(null);

  // ── บานอ่าน ──────────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MailThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── คิว optimistic + เมลใหม่ ─────────────────────────────────────────────
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [pendingNew, setPendingNew] = useState<MailMessage[]>([]);
  const [mailboxes, setMailboxes] = useState<MailboxSummary[]>([]);
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ── กล่องเขียน (M2) ──────────────────────────────────────────────────────
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSeed, setComposeSeed] = useState<MailComposeSeed | null>(null);
  const [identities, setIdentities] = useState<MailIdentityOption[]>([]);
  const [selfEmail, setSelfEmail] = useState("");

  const queueRef = useRef(new Map<DestructiveAction, QueueEntry>());
  const listRef = useRef<MailListHandle>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const scrollOffsetRef = useRef(0);
  const messagesRef = useRef<MailMessage[]>([]);
  messagesRef.current = messages;
  /** timer ของ dwell "อ่านแล้ว" — เก็บไว้เพื่อให้คีย์ `u` ยกเลิกได้ก่อนครบเวลา */
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleExpired = useCallback(() => {
    router.push(`${basePath}/login?reason=expired`);
  }, [basePath, router]);

  // debounce คำค้น (ค้นหาเป็น POST — คำค้นห้ามอยู่ใน URL/log)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = useCallback(
    (extra: Record<string, unknown>) => ({
      box,
      limit: PAGE_SIZE,
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
      ...(filters.unread ? { unread: true } : {}),
      ...(filters.attachment ? { attachment: true } : {}),
      ...extra,
    }),
    [box, debouncedSearch, filters.attachment, filters.unread],
  );

  // รายชื่อกล่อง (ใช้ตัวเลขยังไม่ได้อ่านที่หัวรายการ)
  const loadMailboxes = useCallback(async () => {
    try {
      const d = await callMailApi<{
        mailboxes: MailboxSummary[];
        folders?: MailFolder[];
        email: string;
      }>("/api/mail/mailboxes");
      setMailboxes(d.mailboxes ?? []);
      setFolders(d.folders ?? []);
      // ส่งต่อให้ rail ใน shell ใช้ชุดเดียวกัน — **rail ห้ามยิง API เองเมื่อหน้านี้ถูก mount**
      // (สองที่ยิงคนละจังหวะ = ตัวเลขบนหัวรายการกับข้าง rail ขัดกันเอง + โหลด JMAP ซ้ำซ้อน)
      window.dispatchEvent(
        new CustomEvent("mail:mailboxes", {
          detail: { mailboxes: d.mailboxes ?? [], folders: d.folders ?? [] },
        }),
      );
    } catch {
      /* ตัวเลขสรุปพลาดได้ ไม่ต้องรบกวนผู้ใช้ — รายการเมลคือของหลัก */
    }
  }, []);

  /**
   * ตัวเลข "ยังไม่ได้อ่าน" ต้องขยับตามสิ่งที่ผู้ใช้เพิ่งทำ ไม่ใช่ค้างค่าตอนเปิดกล่อง
   * → เรียกซ้ำหลัง อ่าน/ลบ/เก็บ/รีเฟรช/มีเมลใหม่ · debounce 1 วิ กันยิงรัวตอนกดหลายฉบับติดกัน
   */
  const mailboxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * แคชหน้าแรกของแต่ละกล่อง (ดู `loadFirstPage`) — ต้องทิ้งทุกครั้งที่ **ข้อมูลขยับ**
   * ไม่งั้นกลับมากล่องเดิมแล้วเห็นเมลที่เพิ่งลบ/ย้าย โผล่ค้างชั่วครู่ก่อนของจริงมาทับ
   *
   * 🔴 แยกจาก `scheduleMailboxRefresh` เด็ดขาด — เคยเอาไปล้างไว้ในนั้น แล้วปรากฏว่า
   *    "สลับกล่อง" ก็เรียกตัวนั้นด้วย ⇒ แคชถูกล้างก่อนถูกอ่านทุกครั้ง = ฟีเจอร์ไม่เคยทำงานเลย
   */
  const firstPageCacheRef = useRef(new Map<string, ListResponse>());
  const invalidateFirstPages = useCallback(() => {
    firstPageCacheRef.current.clear();
  }, []);

  const scheduleMailboxRefresh = useCallback(() => {
    if (mailboxTimerRef.current) clearTimeout(mailboxTimerRef.current);
    mailboxTimerRef.current = setTimeout(() => void loadMailboxes(), 1000);
  }, [loadMailboxes]);

  /** ข้อมูลขยับ (ลบ/ย้าย/อ่านแล้ว/ติดดาว) = ทิ้งแคช + รีเฟรชตัวเลข — คู่นี้มาด้วยกันเสมอ */
  const afterMutation = useCallback(() => {
    invalidateFirstPages();
    scheduleMailboxRefresh();
  }, [invalidateFirstPages, scheduleMailboxRefresh]);

  /**
   * โหลดครั้งแรกตอนเปิดหน้า แล้ว "สลับกล่อง" ให้ตามมาทีหลังแบบหน่วง (ไม่ยิงทันที)
   * — ตัวเลขยังไม่ได้อ่านเป็นของรอง ค่าเดิมที่ค้างอยู่ 1 วินาทีไม่ทำให้ใครเข้าใจผิด
   *   แต่การยิง JMAP ทุกครั้งที่คลิกเมนูคือรอบ network ที่เสียเปล่าจริง ๆ
   */
  const mailboxesLoadedRef = useRef(false);
  useEffect(() => {
    if (!mailboxesLoadedRef.current) {
      mailboxesLoadedRef.current = true;
      void loadMailboxes();
      return;
    }
    scheduleMailboxRefresh();
  }, [box, loadMailboxes, scheduleMailboxRefresh]);

  // กล่องจัดการโฟลเดอร์อยู่ใน shell (คนละต้นไม้) → คุยกันด้วย event เพื่อคงแหล่งข้อมูลเดียว
  useEffect(() => {
    const onChanged = () => void loadMailboxes();
    window.addEventListener("mail:folders-changed", onChanged);
    return () => window.removeEventListener("mail:folders-changed", onChanged);
  }, [loadMailboxes]);

  useEffect(
    () => () => {
      if (mailboxTimerRef.current) clearTimeout(mailboxTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    callMailApi<{ identities: MailIdentityOption[]; defaultEmail: string }>("/api/mail/identities")
      .then((d) => {
        if (!alive) return;
        setIdentities(d.identities ?? []);
        setSelfEmail(d.defaultEmail ?? "");
      })
      .catch(() => {
        /* เขียนเมลไม่ได้ = ปุ่มยังกดได้แต่จะฟ้องตอนส่ง — ไม่รบกวนตอนเปิดหน้า */
      });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * แคชหน้าแรกของกล่อง/ตัวกรองที่เคยเปิดในเซสชันนี้ — กลับมากล่องเดิมแล้วเห็นรายการทันที
   * (เดิมขึ้น skeleton รอ JMAP ทุกครั้งที่คลิกเมนู ทั้งที่ข้อมูลชุดเดิมเพิ่งอยู่ในมือ)
   *
   * ⚠️ เป็นแค่ภาพชั่วคราว — ยิงของจริงตามหลังเสมอแล้วทับ (สถานะอ่าน/ลบจากอุปกรณ์อื่นต้องมาถูก)
   * และ **ไม่ persist ลง storage** ตามกฎเดิมของโซนนี้ (หลังรีโหลดยึดเซิร์ฟเวอร์เท่านั้น)
   */
  const cacheKey = useMemo(() => JSON.stringify(buildQuery({})), [buildQuery]);

  const loadFirstPage = useCallback(
    async (mode: "initial" | "refresh") => {
      const cached = mode === "initial" ? firstPageCacheRef.current.get(cacheKey) : undefined;
      if (cached) {
        // คิว "เมลใหม่" เป็นของกล่องก่อนหน้า — ไม่ล้างที่นี่ ผู้ใช้กด "แสดง" แล้วได้เมลข้ามกล่อง
        setPendingNew([]);
        setMessages(cached.messages ?? []);
        setHasMore(!!cached.hasMore);
        setTotal(cached.total ?? null);
        setFocusedIndex(cached.messages?.length ? 0 : -1);
        setRefreshing(true);
      } else if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        const data = await postJson<ListResponse>(
          "/api/mail/messages",
          buildQuery({ position: 0 }),
        );
        setMessages(data.messages ?? []);
        setHasMore(!!data.hasMore);
        setTotal(data.total ?? null);
        setPendingNew([]);
        setFocusedIndex(data.messages?.length ? 0 : -1);
        if (mode === "refresh") scheduleMailboxRefresh();
        // เก็บผลจริงลงแคชเสมอ (ทั้ง initial และ refresh) — ครั้งหน้าที่กลับมากล่องนี้จะวาดทันที
        firstPageCacheRef.current.set(cacheKey, data);
      } catch (e) {
        if (e instanceof MailSessionExpiredError) return handleExpired();
        setError(e instanceof Error ? e.message : GENERIC_ERROR);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [buildQuery, cacheKey, handleExpired, scheduleMailboxRefresh],
  );

  // โหลดใหม่เมื่อเปลี่ยนกล่อง / คำค้น / ตัวกรอง
  useEffect(() => {
    setSelectedIds(new Set());
    setActiveId(null);
    setDetail(null);
    void loadFirstPage("initial");
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    const current = messagesRef.current;
    if (!hasMore || loadingMore || loading || current.length === 0) return;
    setLoadingMore(true);
    try {
      const anchor = current[current.length - 1]!.id;
      const data = await postJson<ListResponse>(
        "/api/mail/messages",
        buildQuery({ anchor, anchorOffset: 1 }),
      );
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...(data.messages ?? []).filter((m) => !seen.has(m.id))];
      });
      setHasMore(!!data.hasMore);
    } catch (e) {
      if (e instanceof MailSessionExpiredError) return handleExpired();
      notify.error(e, GENERIC_ERROR);
    } finally {
      setLoadingMore(false);
    }
  }, [buildQuery, handleExpired, hasMore, loading, loadingMore]);

  // เมลใหม่ต้องโผล่เองได้ — poll เฉพาะตอนแท็บเปิดอยู่ และห้ามแทรกจนแถวกระโดด
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible" || loading) return;
      try {
        const data = await postJson<ListResponse>(
          "/api/mail/messages",
          buildQuery({ position: 0 }),
        );
        const known = new Set(messagesRef.current.map((m) => m.id));
        const fresh = (data.messages ?? []).filter((m) => !known.has(m.id));
        if (fresh.length === 0) return;
        afterMutation();
        if (scrollOffsetRef.current <= 0) {
          setMessages((prev) => [...fresh, ...prev]);
        } else {
          setPendingNew((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            return [...fresh.filter((m) => !seen.has(m.id)), ...prev];
          });
        }
      } catch {
        /* poll พลาดได้เงียบ ๆ — ผู้ใช้ยังมีปุ่มรีเฟรชมือ */
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [afterMutation, buildQuery, loading]);

  const applyPendingNew = useCallback(() => {
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      return [...pendingNew.filter((m) => !seen.has(m.id)), ...prev];
    });
    setPendingNew([]);
    listRef.current?.scrollToTop();
  }, [pendingNew]);

  const visibleMessages = useMemo(
    () => messages.filter((m) => !hiddenIds.has(m.id)),
    [hiddenIds, messages],
  );

  /** กล่องที่กำลังเปิด — คีย์ระบบหรือโฟลเดอร์เอง (ใช้ตัดสินปุ่ม/ปลายทางที่ย้ายได้) */
  const selector = useMemo(() => resolveBoxSelector(box), [box]);

  /** ชื่อโฟลเดอร์ของผู้ใช้รู้ได้หลังโหลดรายการกล่องเท่านั้น (SSR อ่าน cookie ของเมลไม่ได้) */
  const currentBoxLabel = useMemo(() => {
    if (selector.kind !== "folder") return boxLabel;
    return folders.find((f) => f.id === selector.mailboxId)?.name ?? boxLabel;
  }, [boxLabel, folders, selector]);

  const unreadCount = useMemo(() => {
    if (selector.kind === "folder") {
      return folders.find((f) => f.id === selector.mailboxId)?.unreadCount ?? null;
    }
    return mailboxes.find((m) => m.key === selector.key)?.unreadCount ?? null;
  }, [folders, mailboxes, selector]);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const visibleRef = useRef<MailMessage[]>([]);
  visibleRef.current = visibleMessages;
  const focusedIndexRef = useRef(-1);
  focusedIndexRef.current = focusedIndex;
  const selectedIdsRef = useRef<Set<string>>(selectedIds);
  selectedIdsRef.current = selectedIds;

  // ── แก้สถานะแถวในหน่วยความจำ (optimistic) ────────────────────────────────
  const patchLocal = useCallback((ids: string[], patch: Partial<MailMessage>) => {
    const set = new Set(ids);
    setMessages((prev) => prev.map((m) => (set.has(m.id) ? { ...m, ...patch } : m)));
  }, []);

  const runBulk = useCallback(
    async (ids: string[], action: MailBulkAction, revert: () => void, by: MailScope = "email") => {
      if (ids.length === 0) return;
      try {
        await postJson("/api/mail/messages/bulk", { ids, action, by });
        afterMutation();
      } catch (e) {
        revert();
        if (e instanceof MailSessionExpiredError) return handleExpired();
        notify.error(e, GENERIC_ERROR);
      }
    },
    [handleExpired, scheduleMailboxRefresh],
  );

  /**
   * `by` ต้องตรงกับ "หน่วยที่ผู้ใช้เห็น": เปิดอ่าน = เปิดทั้งเธรด (`?by=thread`)
   * ⇒ ต้องมาร์คอ่านทั้งเธรดด้วย ไม่งั้นเธรด 3 ฉบับอ่านครบด้วยตาแต่ค้าง unread 2
   * ส่วนคีย์ `u` (ทำเป็นยังไม่อ่าน) เป็นการกระทำต่อ "ฉบับ" จึงคง `email` ตามเดิม
   */
  const setReadState = useCallback(
    (ids: string[], isUnread: boolean, by: MailScope = "email") => {
      if (ids.length === 0) return;
      // ผู้ใช้สั่ง "ยังไม่อ่าน" เอง → ยกเลิก dwell ที่กำลังนับอยู่ ไม่งั้นมันมาทับความตั้งใจทีหลัง
      if (isUnread && dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
      patchLocal(ids, { isUnread });
      void runBulk(
        ids,
        isUnread ? "unread" : "read",
        () => patchLocal(ids, { isUnread: !isUnread }),
        by,
      );
    },
    [patchLocal, runBulk],
  );

  const toggleStar = useCallback(
    (ids: string[], next: boolean) => {
      if (ids.length === 0) return;
      patchLocal(ids, { isFlagged: next });
      void runBulk(ids, next ? "star" : "unstar", () => patchLocal(ids, { isFlagged: !next }));
    },
    [patchLocal, runBulk],
  );

  // ── คิว "ลบ/เก็บเข้าคลัง" + เลิกทำ 8 วิ ──────────────────────────────────
  const unhide = useCallback((ids: string[]) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const flushQueue = useCallback(
    async (action: DestructiveAction, keepalive = false) => {
      const entry = queueRef.current.get(action);
      if (!entry) return;
      clearTimeout(entry.timer);
      queueRef.current.delete(action);
      dismissUndoToast(`mail-undo-${action}`);
      const ids = entry.ids;
      try {
        await postJson("/api/mail/messages/bulk", { ids, action, by: "thread" }, keepalive);
        setMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
        unhide(ids);
        afterMutation();
      } catch (e) {
        unhide(ids);
        if (e instanceof MailSessionExpiredError) return handleExpired();
        notify.error(e, "ทำรายการไม่สำเร็จ อีเมลถูกคืนกลับรายการแล้ว");
      }
    },
    [handleExpired, scheduleMailboxRefresh, unhide],
  );

  const undoQueued = useCallback(
    (action: DestructiveAction) => {
      const entry = queueRef.current.get(action);
      if (!entry) return;
      clearTimeout(entry.timer);
      queueRef.current.delete(action);
      unhide(entry.ids);
    },
    [unhide],
  );

  const enqueueDestructive = useCallback(
    (action: DestructiveAction, ids: string[]) => {
      if (ids.length === 0) return;
      setHiddenIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      setSelectedIds(new Set());
      if (activeIdRef.current && ids.includes(activeIdRef.current)) {
        setActiveId(null);
        setDetail(null);
      }
      const existing = queueRef.current.get(action);
      if (existing) clearTimeout(existing.timer);
      const merged = Array.from(new Set([...(existing?.ids ?? []), ...ids]));
      const timer = setTimeout(() => void flushQueue(action), UNDO_TOAST_MS);
      queueRef.current.set(action, { ids: merged, timer });
      showUndoToast({
        id: `mail-undo-${action}`,
        message: `${ACTION_LABEL[action]} ${merged.length} ฉบับ`,
        onUndo: () => undoQueued(action),
      });
    },
    [flushQueue, undoQueued],
  );

  /**
   * ส่งเมล = เข้าคิว 8 วิ เหมือน ลบ/เก็บ (MAIL_UI_SPEC §4)
   * **ห้ามยิง /api/mail/send ทันที** — ส่งผิดคนคือความผิดพลาดที่แก้ไม่ได้
   * flush ตอน `pagehide` ด้วย keepalive (เหมือนคิวลบ) ไม่งั้นเมลที่ตั้งใจส่งหายไปเฉย ๆ
   */
  const sendQueueRef = useRef(
    new Map<string, { payload: MailDraftPayload; timer: ReturnType<typeof setTimeout> }>(),
  );

  /** เปิดกล่องเขียนกลับมาพร้อมของเดิมครบ — ใช้ทั้งตอน "เลิกทำ" และตอนส่งไม่สำเร็จ */
  const reopenCompose = useCallback((payload: MailDraftPayload) => {
    setComposeSeed({
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      attachments: payload.attachments,
      identityId: payload.identityId,
      draftId: payload.draftId,
      subject: payload.subject,
      body: payload.body,
      inReplyTo: payload.inReplyTo,
      references: payload.references,
      focus: "body",
    });
    setComposeOpen(true);
  }, []);

  const flushSend = useCallback(
    async (key: string, keepalive = false) => {
      const entry = sendQueueRef.current.get(key);
      if (!entry) return;
      clearTimeout(entry.timer);
      sendQueueRef.current.delete(key);
      dismissUndoToast(SEND_TOAST_ID);
      try {
        const res = await postJson<{ movedToSent?: boolean }>(
          "/api/mail/send",
          entry.payload,
          keepalive,
        );
        // ส่งออกไปแล้วจริงแม้ย้ายเข้ากล่อง "ส่งแล้ว" ไม่สำเร็จ — ห้ามบอกว่าล้มเหลว (จะกดส่งซ้ำ)
        if (res?.movedToSent === false) {
          notify.success("ส่งแล้ว (แต่ยังไม่ได้ย้ายเข้ากล่องส่งแล้ว)");
        } else {
          notify.success("ส่งอีเมลแล้ว");
        }
        afterMutation();
        void loadFirstPage("refresh");
      } catch (e) {
        if (e instanceof MailSessionExpiredError) return handleExpired();
        // 🔴 ห้ามทิ้ง payload — ร่างอาจถูกลบไปแล้วในฝั่งเซิร์ฟเวอร์ระหว่างพยายามส่ง
        notify.error(e, "ส่งไม่สำเร็จ — เปิดกล่องเขียนกลับมาให้แล้ว");
        reopenCompose(entry.payload);
      }
    },
    [handleExpired, loadFirstPage, reopenCompose, scheduleMailboxRefresh],
  );

  const enqueueSend = useCallback(
    (payload: MailDraftPayload) => {
      const key = `mail-send-${Date.now()}`;
      const timer = setTimeout(() => void flushSend(key), UNDO_TOAST_MS);
      sendQueueRef.current.set(key, { payload, timer });
      setComposeOpen(false);
      /**
       * 🔴 ใช้ **id เดียวตายตัว** สำหรับ toast ของการส่ง ไม่ใช่ id ต่อฉบับ
       *    ส่งรัว ๆ แล้ว toast ซ้อนกันหลายใบ ผู้ใช้จะกด "เลิกทำ" ผิดใบ (ของฉบับที่ส่งไปแล้ว)
       *    แล้วเข้าใจว่ายกเลิกสำเร็จ ทั้งที่เมลออกไปแล้ว — เจอจริงตอนทดสอบ 2026-08-15
       *    ⇒ ใบที่เห็นบนจอต้องหมายถึง "ฉบับล่าสุด" เสมอ
       */
      showUndoToast({
        id: SEND_TOAST_ID,
        message: `ส่งถึง ${payload.to[0] ?? ""}${payload.to.length > 1 ? ` +${payload.to.length - 1}` : ""}`,
        onUndo: () => {
          const entry = sendQueueRef.current.get(key);
          if (!entry) {
            // ครบ 8 วิไปแล้ว = ส่งออกจริง — ต้องบอกตรง ๆ ห้ามเงียบให้เข้าใจผิดว่ายกเลิกได้
            notify.error(null, "ส่งออกไปแล้ว ยกเลิกไม่ทัน");
            return;
          }
          clearTimeout(entry.timer);
          sendQueueRef.current.delete(key);
          reopenCompose(payload); // ต้องได้ไฟล์แนบ/สำเนาลับ/ร่างเดิมกลับมาครบ
        },
      });
    },
    [flushSend, reopenCompose],
  );

  // flush คิวที่ค้างเมื่อกำลังจะออกจากหน้า — ไม่งั้นการกระทำหายเงียบ
  const flushRef = useRef(flushQueue);
  flushRef.current = flushQueue;
  const sendFlushRef = useRef(flushSend);
  sendFlushRef.current = flushSend;
  useEffect(() => {
    const flushAll = () => {
      for (const action of Array.from(queueRef.current.keys())) {
        void flushRef.current(action, true);
      }
      for (const key of Array.from(sendQueueRef.current.keys())) {
        void sendFlushRef.current(key, true);
      }
    };
    // 🔴 `pagehide` เท่านั้น — **ห้ามผูก `visibilitychange`** (เคยผูกแล้วถอดออก):
    //    สลับแท็บไปดูอย่างอื่นแล้วกลับมาเป็นเรื่องปกติ ถ้า flush ตอนนั้น = ลบจริงทันที
    //    ผู้ใช้กด "เลิกทำ" ไม่ทันทั้งที่ยังไม่ครบ 8 วิ · ถ้าเบราว์เซอร์ฆ่าแท็บทิ้งโดยไม่ยิง
    //    pagehide คิวจะหายไปเฉย ๆ = **ไม่มีอะไรถูกลบ** ซึ่งเป็นทางที่ปลอดภัยกว่า
    window.addEventListener("pagehide", flushAll);
    return () => {
      window.removeEventListener("pagehide", flushAll);
      flushAll();
    };
  }, []);

  /**
   * คลิกแถวในกล่อง "ร่าง" = กลับไปเขียนต่อ ไม่ใช่เปิดบานอ่าน
   * (ไม่งั้นปุ่ม "เก็บเป็นร่าง" ส่งงานเข้าหลุมดำ — ต้องไปเปิด client อื่นเพื่อเขียนต่อ
   * ซึ่งผิดเกณฑ์ผ่านของ M2 ตรง ๆ)
   */
  const openDraft = useCallback(
    async (m: MailMessage) => {
      setFocusedIndex(visibleRef.current.findIndex((x) => x.id === m.id));
      try {
        const detailData = await callMailApi<MailThreadDetail>(
          `/api/mail/messages/${encodeURIComponent(m.id)}?by=email`,
        );
        const source = detailData.messages[0];
        if (!source) return;
        setComposeSeed({
          to: source.to.map((a) => a.email),
          cc: source.cc.map((a) => a.email),
          subject: source.subject === "(ไม่มีหัวเรื่อง)" ? "" : source.subject,
          body: source.textBody ?? "",
          attachments: source.attachments.map((a) => ({
            blobId: a.blobId,
            name: a.name,
            type: a.type,
            size: a.sizeBytes,
          })),
          draftId: source.id,
          focus: "body",
        });
        setComposeOpen(true);
      } catch (e) {
        if (e instanceof MailSessionExpiredError) return handleExpired();
        notify.error(e, "เปิดร่างไม่สำเร็จ");
      }
    },
    [handleExpired],
  );

  // ── เปิดอ่าน ─────────────────────────────────────────────────────────────
  const openMessage = useCallback(
    async (m: MailMessage, index: number) => {
      setActiveId(m.id);
      setFocusedIndex(index);
      setDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      try {
        const data = await callMailApi<MailThreadDetail>(
          `/api/mail/messages/${encodeURIComponent(m.id)}?by=thread`,
        );
        setDetail(data);
      } catch (e) {
        if (e instanceof MailSessionExpiredError) return handleExpired();
        setDetailError(e instanceof Error ? e.message : GENERIC_ERROR);
      } finally {
        setDetailLoading(false);
      }
    },
    [handleExpired],
  );

  /**
   * มาร์ค "อ่านแล้ว" หลังเปิดค้างครบ dwell — **ห้ามมาร์คทันทีที่เปิด**
   * ผู้ใช้ที่กด j/k ผ่านหรือเผลอคลิกจะทำสถานะ "ยังไม่ได้อ่าน" หายถาวรโดยไม่มีทางเลิกทำ
   * เปลี่ยนฉบับ/ปิดบานอ่านก่อนครบเวลา = ยกเลิก (cleanup ของ effect)
   */
  useEffect(() => {
    if (!activeId) return;
    const target = messagesRef.current.find((m) => m.id === activeId);
    if (!target?.isUnread) return;
    const t = setTimeout(() => setReadState([activeId], false, "thread"), MARK_READ_DWELL_MS);
    dwellTimerRef.current = t;
    return () => {
      clearTimeout(t);
      if (dwellTimerRef.current === t) dwellTimerRef.current = null;
    };
  }, [activeId, setReadState]);

  const openByIndex = useCallback(
    (index: number) => {
      const m = visibleRef.current[index];
      if (!m) return;
      if (box === "drafts") void openDraft(m);
      else void openMessage(m, index);
    },
    [box, openDraft, openMessage],
  );

  // ── เปิดกล่องเขียน (M2) ───────────────────────────────────────────────────
  const openCompose = useCallback((seed: MailComposeSeed | null = null) => {
    setComposeSeed(seed);
    setComposeOpen(true);
  }, []);

  const detailRef = useRef<MailThreadDetail | null>(null);
  detailRef.current = detail;

  /** ตอบ/ตอบทั้งหมด/ส่งต่อ ใช้ "ฉบับล่าสุดในเธรด" เป็นต้นทางเสมอ (ตรงกับที่บานอ่านกางอยู่) */
  const openReply = useCallback(
    (mode: "reply" | "replyAll" | "forward") => {
      const thread = detailRef.current;
      const source = thread?.messages[thread.messages.length - 1];
      if (!source) return;

      const inReplyTo = source.messageId?.[0] ?? null;
      const references = source.references ?? [];

      if (mode === "forward") {
        openCompose({
          subject: forwardSubject(source.subject),
          body: buildForwardBody({
            from: source.from,
            to: source.to,
            subject: source.subject,
            receivedAt: source.receivedAt,
            textBody: source.textBody,
          }),
          focus: "body",
        });
        return;
      }

      const { to, cc } = replyRecipients(source, selfEmail, mode === "replyAll");
      openCompose({
        to: to.map((a) => a.email),
        cc: cc.map((a) => a.email),
        subject: replySubject(source.subject),
        body: buildQuotedReply({
          from: source.from,
          receivedAt: source.receivedAt,
          textBody: source.textBody,
        }),
        inReplyTo,
        references,
        focus: "body",
      });
    },
    [openCompose, selfEmail],
  );

  // ── การเลือกหลายรายการ (shift-click = ช่วง) ──────────────────────────────
  const toggleSelect = useCallback((m: MailMessage, index: number, shiftKey: boolean) => {
    setFocusedIndex(index);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const last = lastSelectedIndexRef.current;
      if (shiftKey && last !== null) {
        const [from, to] = last < index ? [last, index] : [index, last];
        for (let i = from; i <= to; i++) {
          const row = visibleRef.current[i];
          if (row) next.add(row.id);
        }
      } else if (next.has(m.id)) {
        next.delete(m.id);
      } else {
        next.add(m.id);
      }
      return next;
    });
    lastSelectedIndexRef.current = index;
  }, []);

  /** เป้าหมายของ action: ที่เลือกไว้ ถ้าไม่มีก็ใช้แถวที่เคอร์เซอร์/เปิดอยู่ */
  const actionTargets = useCallback((): string[] => {
    if (selectedIdsRef.current.size > 0) return Array.from(selectedIdsRef.current);
    const focused = visibleRef.current[focusedIndexRef.current];
    if (focused) return [focused.id];
    return activeIdRef.current ? [activeIdRef.current] : [];
  }, []);

  const moveFocus = useCallback((delta: number) => {
    const count = visibleRef.current.length;
    if (count === 0) return;
    const next = Math.min(count - 1, Math.max(0, focusedIndexRef.current + delta));
    setFocusedIndex(next);
    listRef.current?.scrollToIndex(next);
  }, []);

  const closePane = useCallback(() => {
    if (activeIdRef.current) {
      setActiveId(null);
      setDetail(null);
      return;
    }
    setSelectedIds(new Set());
  }, []);

  /**
   * ปลายทางของ action = กล่องที่ยืนอยู่ → ไม่มีอะไรเกิดขึ้น แต่แถวหายจากจอ + ขึ้น toast หลอก
   * ⇒ ปิดไปเลยทั้งคีย์ลัด/ปุ่ม (ห้ามมีปุ่มที่กดแล้วไม่เกิดอะไร — contract §6)
   */
  const isSystemBox = (key: MailBoxKey) => selector.kind === "system" && selector.key === key;
  const canArchive = !isSystemBox("archive");
  const canTrash = !isSystemBox("trash");
  const isDrafts = isSystemBox("drafts");

  /** ย้ายเข้าโฟลเดอร์ที่ผู้ใช้สร้างเอง — ไม่เข้าคิวเลิกทำ (ไม่ใช่การทำลาย ย้ายกลับเองได้) */
  const moveToMailbox = useCallback(
    async (
      ids: string[],
      mailboxId: string,
      label: string,
      opts: { successText?: string; by?: MailScope } = {},
    ) => {
      if (ids.length === 0) return;
      setHiddenIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      setSelectedIds(new Set());
      try {
        await postJson("/api/mail/messages/bulk", {
          ids,
          action: "move",
          // ย้ายโฟลเดอร์ = ทั้งเธรด (คนคิดเป็นบทสนทนา) · แจ้งสแปม = รายฉบับ
          // (เธรดเดียวมีทั้งสแปมและเมลที่เราตอบเอง — ป้อนทั้งชุดให้ตัวกรองคือสอนผิด)
          by: opts.by ?? "thread",
          mailboxId,
        });
        setMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
        unhide(ids);
        if (ids.includes(activeIdRef.current ?? "")) {
          setActiveId(null);
          setDetail(null);
        }
        afterMutation();
        notify.success(opts.successText ?? `ย้ายไป “${label}” แล้ว`);
      } catch (e) {
        unhide(ids);
        if (e instanceof MailSessionExpiredError) return handleExpired();
        notify.error(e, "ย้ายอีเมลไม่สำเร็จ");
      }
    },
    [afterMutation, handleExpired, unhide],
  );

  const moveToFolder = useCallback(
    (ids: string[], folder: MailFolder) => moveToMailbox(ids, folder.id, folder.name),
    [moveToMailbox],
  );

  /**
   * แจ้งสแปม / ไม่ใช่สแปม — ในทางเทคนิคคือ "ย้ายเข้า-ออกกล่องจดหมายขยะ"
   * ซึ่ง **เป็นสัญญาณสอนตัวกรองของเมลเซิร์ฟเวอร์ด้วย** (Stalwart เก็บตัวอย่างไปฝึกต่อ)
   * ⇒ ห้ามทำเป็นแค่ "ลบ" หรือย้ายเข้าโฟลเดอร์ที่ผู้ใช้สร้างเอง จะไม่มีการเรียนรู้เกิดขึ้น
   */
  const junkMailboxId = useMemo(
    () => mailboxes.find((m) => m.key === "junk")?.id ?? null,
    [mailboxes],
  );
  const inboxMailboxId = useMemo(
    () => mailboxes.find((m) => m.key === "inbox")?.id ?? null,
    [mailboxes],
  );
  const inJunk = isSystemBox("junk");
  /**
   * กล่องที่ **ห้ามมีปุ่ม "นี่คือสแปม"** — เมลในนี้เป็นของเราเอง
   * ส่งแล้ว/ฉบับร่าง: กดแล้วได้สอนตัวกรองว่าโดเมนตัวเองคือสแปม (ร่างยังหายจากที่ควรอยู่ด้วย)
   * ถังขยะ: ผู้ใช้ตัดสินไปแล้วว่าไม่เอา ไม่ต้องมีทางเลือกที่สอง
   */
  const canReportSpam = !inJunk && !isSystemBox("sent") && !isDrafts && !isSystemBox("trash");

  const markSpam = useCallback(
    (ids: string[]) => {
      if (!junkMailboxId) return;
      void moveToMailbox(ids, junkMailboxId, "จดหมายขยะ", {
        successText: "ย้ายไปจดหมายขยะแล้ว",
        by: "email",
      });
    },
    [junkMailboxId, moveToMailbox],
  );
  const markNotSpam = useCallback(
    (ids: string[]) => {
      if (!inboxMailboxId) return;
      void moveToMailbox(ids, inboxMailboxId, "กล่องขาเข้า", {
        successText: "ย้ายกลับกล่องขาเข้าแล้ว",
        by: "email",
      });
    },
    [inboxMailboxId, moveToMailbox],
  );

  /**
   * เลือกทั้งหมด = ทุกฉบับ **ที่โหลดมาแล้วและมองเห็นอยู่** (ไม่ใช่ทั้งกล่อง)
   * เลือกของที่ผู้ใช้ยังไม่เคยเห็นแล้วกดลบ/ย้าย คือความเสียหายที่กู้ยาก
   */
  const selectAllState: "none" | "some" | "all" = useMemo(() => {
    if (visibleMessages.length === 0 || selectedIds.size === 0) return "none";
    return visibleMessages.every((m) => selectedIds.has(m.id)) ? "all" : "some";
  }, [visibleMessages, selectedIds]);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const all = visibleMessages.length > 0 && visibleMessages.every((m) => prev.has(m.id));
      return all ? new Set<string>() : new Set(visibleMessages.map((m) => m.id));
    });
  }, [visibleMessages]);

  /**
   * ล้างถังขยะ/จดหมายขยะ — **ลบถาวร ไม่มีเลิกทำ** ⇒ ต้องยืนยันก่อนเสมอ
   * เดินเป็นก้อนจนหมดเหมือนงานอื่น (เพดานต่อ request กันลบครึ่ง ๆ กลาง ๆ ตอน timeout)
   */
  const emptyableBox = isSystemBox("trash") ? "trash" : isSystemBox("junk") ? "junk" : null;
  /**
   * 🔴 จำนวนที่โชว์ในคำยืนยันต้องเป็นของ **ทั้งกล่อง** ไม่ใช่ `total` ของรายการที่กรอง/ค้นอยู่
   *    (เคยพลาด: ค้นแล้วเห็น 3 ฉบับ กดยืนยัน "3 ฉบับ" แต่ของจริงหาย 560 — ลบถาวรกู้ไม่ได้)
   *    และระหว่างมีตัวกรอง/คำค้น **ห้ามล้าง** เพราะสิ่งที่ผู้ใช้เห็นตรงหน้าไม่ใช่สิ่งที่จะโดนลบ
   */
  const emptyBoxTotal = useMemo(
    () =>
      emptyableBox ? (mailboxes.find((m) => m.key === emptyableBox)?.totalCount ?? null) : null,
    [emptyableBox, mailboxes],
  );
  const emptyBlockedByFilter = !!debouncedSearch || filters.unread || filters.attachment;
  const [emptyConfirm, setEmptyConfirm] = useState(false);
  const [emptying, setEmptying] = useState(false);

  const emptyBox = useCallback(async () => {
    if (!emptyableBox) return;
    setEmptying(true);
    let removed = 0;
    let left = 0;
    let failed: unknown = null;
    try {
      // เดินเป็นก้อนจนหมด · เพดานรอบกันลูปไม่รู้จบถ้าเซิร์ฟเวอร์รายงาน remaining ไม่ลด
      for (let round = 0; round < EMPTY_MAX_ROUNDS; round += 1) {
        const res = await postJson<{ destroyed: number; remaining: number }>(
          "/api/mail/messages/empty",
          { box: emptyableBox },
        );
        removed += res.destroyed ?? 0;
        left = res.remaining ?? 0;
        if (!res.destroyed || !res.remaining) break;
      }
    } catch (e) {
      if (e instanceof MailSessionExpiredError) {
        setEmptying(false);
        setEmptyConfirm(false);
        return handleExpired();
      }
      failed = e;
    }

    setEmptying(false);
    setEmptyConfirm(false);
    setSelectedIds(new Set());
    setActiveId(null);
    setDetail(null);
    afterMutation();

    if (failed) {
      // ลบไปแล้วบางส่วนก่อนพัง = **ห้ามบอกว่าไม่สำเร็จเฉย ๆ** ของหายไปจริงและกู้ไม่ได้
      if (removed > 0) notify.error(null, `ลบถาวรไปแล้ว ${removed} ฉบับ แล้วเจอปัญหา`);
      else notify.error(failed, "ล้างกล่องไม่สำเร็จ");
    } else if (removed === 0) {
      notify.success("ไม่มีอะไรให้ลบ");
    } else {
      // เหลือค้าง = ต้องบอกตรง ๆ พร้อมบอกว่าให้กดซ้ำ (ห้ามตัดเงียบ)
      notify.success(
        left > 0
          ? `ลบถาวรแล้ว ${removed} ฉบับ · เหลืออีก ${left} กดล้างอีกครั้งได้`
          : `ลบถาวรแล้ว ${removed} ฉบับ`,
      );
    }

    // รีเฟรชรายการเป็นงานคนละชิ้น — พังตรงนี้ไม่ได้แปลว่าการลบไม่สำเร็จ
    try {
      await loadFirstPage("refresh");
    } catch {
      /* รายการจะตามมาเองตอนรีเฟรชรอบหน้า */
    }
  }, [afterMutation, emptyableBox, handleExpired, loadFirstPage]);

  /** ปลายทางที่ให้เลือกย้าย — ตัดโฟลเดอร์ที่ยืนอยู่ออก (กดแล้วไม่เกิดอะไร = ห้ามมี) */
  const moveTargets = useMemo(
    () => folders.filter((f) => !(selector.kind === "folder" && f.id === selector.mailboxId)),
    [folders, selector],
  );

  // ── คีย์ลัด — action ทุกตัวมาจาก registry (lib/mail/shortcuts.ts) ────────
  const shortcutHandlers = useMemo<MailShortcutHandlers>(() => {
    return {
      next: () => moveFocus(1),
      prev: () => moveFocus(-1),
      open: () => openByIndex(focusedIndexRef.current),
      close: closePane,
      selectToggle: () => {
        const m = visibleRef.current[focusedIndexRef.current];
        if (m) toggleSelect(m, focusedIndexRef.current, false);
      },
      archive: () => {
        if (canArchive) enqueueDestructive("archive", actionTargets());
      },
      trash: () => {
        if (canTrash) enqueueDestructive("trash", actionTargets());
      },
      star: () => {
        const ids = actionTargets();
        const first = visibleRef.current.find((m) => m.id === ids[0]);
        toggleStar(ids, !first?.isFlagged);
      },
      markUnread: () => setReadState(actionTargets(), true),
      search: () => {
        searchWrapRef.current?.querySelector("input")?.focus();
      },
      help: () => setShowShortcuts(true),
      compose: () => openCompose(null),
      reply: () => openReply("reply"),
      replyAll: () => openReply("replyAll"),
      forward: () => openReply("forward"),
      gotoInbox: () => router.push(`${basePath}/?box=inbox`),
    };
  }, [
    actionTargets,
    basePath,
    canArchive,
    canTrash,
    closePane,
    enqueueDestructive,
    moveFocus,
    openByIndex,
    openCompose,
    openReply,
    router,
    setReadState,
    toggleSelect,
    toggleStar,
  ]);

  /**
   * 🔴 ปิดคีย์ลัดทั้งชุดเมื่อกล่องเขียน/ตารางคีย์ลัดเปิดอยู่
   * react-hotkeys-hook กันแค่ตอนโฟกัสอยู่ใน input/textarea — พอโฟกัสไปอยู่ที่ "ปุ่ม" ในกล่องเขียน
   * (ลิงก์สำเนา, ปุ่มลบไฟล์แนบ, dropzone) แล้วพิมพ์ `#` จะไปลบเมลที่อยู่ข้างหลัง modal
   */
  useMailShortcuts(shortcutHandlers, !showShortcuts && !composeOpen);

  const activeMessage = useMemo(
    () => messages.find((m) => m.id === activeId) ?? null,
    [activeId, messages],
  );

  const totalLabel = total === null ? null : `${total} ฉบับ`;

  /**
   * มุมมอง: `split` = รายการ+บานอ่านคู่กัน · `list` = รายการเต็มความกว้าง (เปิดฉบับไหนค่อยแทนที่)
   * บางคนอยากกวาดตาดูรายการยาว ๆ ไม่ต้องมีบานอ่านกินที่ครึ่งจอ
   *
   * **ค่าจริงเก็บในกล่องเมลของเจ้าตัว** (`/api/mail/prefs`) ⇒ ตามตัวผู้ใช้ไปทุกเครื่อง
   * ส่วน localStorage เหลือเป็นแค่ **แคชกันจอวูบ**: ทาค่าล่าสุดที่เห็นตอน first paint
   * แล้วค่าจากเซิร์ฟเวอร์มาถึงเมื่อไรก็ทับเสมอ (เครื่องที่ใช้ร่วมกันจึงไม่ติดค่าของคนก่อนหน้า
   * เกินชั่วอึดใจ · ออกจากระบบก็ล้างแคชทิ้งที่ `mail-shell.tsx`)
   */
  const [pane, setPane] = useState<MailPaneMode>("split");
  /** ความกว้างคอลัมน์รายการ (px) ตอน split — ผู้ใช้ลากตัวแบ่งได้ (จอ lg ขึ้นไปเท่านั้น) */
  const [listWidth, setListWidth] = useState(MAIL_LIST_WIDTH_DEFAULT);

  /**
   * ค่าล่าสุดของ "ทั้งชุด" — PUT ของ prefs เขียนทับทั้งไฟล์ (normalize เติมค่าเริ่มต้นให้ช่องที่ขาด)
   * ⇒ ส่งแค่ช่องที่เพิ่งเปลี่ยนไม่ได้ ไม่งั้นอีกช่องถูกรีเซ็ตเงียบ ๆ
   */
  const prefsRef = useRef<MailPrefs>({ pane: "split", listWidth: MAIL_LIST_WIDTH_DEFAULT });
  const persistPrefs = useCallback((patch: Partial<MailPrefs>) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    // fire-and-forget — หน้าเว็บต้องตอบสนองทันที ไม่รอเซิร์ฟเวอร์ (พลาดก็แค่ทำใหม่)
    void fetch("/api/mail/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const cachedPane = readCachedPane();
    if (cachedPane) setPane(cachedPane);
    const cachedWidth = readCachedListWidth();
    if (cachedWidth) setListWidth(clampMailListWidth(cachedWidth));
    let alive = true;
    fetch("/api/mail/prefs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: MailPrefs | null) => {
        if (!alive || !data) return;
        const next: MailPaneMode = data.pane === "list" ? "list" : "split";
        const width = clampMailListWidth(data.listWidth);
        prefsRef.current = { pane: next, listWidth: width };
        setPane(next);
        setListWidth(width);
        cachePane(next);
        cacheListWidth(width);
      })
      .catch(() => {
        /* ความชอบโหลดไม่ได้ = ใช้ค่าที่แคชไว้ ไม่ต้องรบกวนผู้ใช้ */
      });
    return () => {
      alive = false;
    };
  }, []);

  const togglePane = useCallback(() => {
    setPane((prev) => {
      const next = prev === "split" ? "list" : "split";
      cachePane(next);
      persistPrefs({ pane: next });
      return next;
    });
  }, [persistPrefs]);

  /**
   * ตัวแบ่งลากได้ระหว่างรายการกับบานอ่าน
   * — จับด้วย pointer capture ⇒ ลากเลยขอบ/ออกนอกหน้าต่างแล้วยังตามอยู่ (ไม่ต้องผูก listener ที่ window)
   * — บันทึกตอนปล่อยมือเท่านั้น (ระหว่างลากยิง PUT ทุกเฟรมคือการทรมานเมลเซิร์ฟเวอร์)
   */
  const widthRef = useRef(listWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  // ค่าที่มาจากแคช/เซิร์ฟเวอร์ก็ต้องกลายเป็นจุดตั้งต้นของการลาก/คีย์ลูกศรครั้งถัดไปด้วย
  useEffect(() => {
    widthRef.current = listWidth;
  }, [listWidth]);

  const applyWidth = useCallback((width: number) => {
    const next = clampMailListWidth(width);
    widthRef.current = next;
    setListWidth(next);
  }, []);

  const commitWidth = useCallback(() => {
    cacheListWidth(widthRef.current);
    persistPrefs({ listWidth: widthRef.current });
  }, [persistPrefs]);

  const onDividerPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      widthRef.current = listWidth;
      dragRef.current = { startX: e.clientX, startWidth: listWidth };
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    },
    [listWidth],
  );

  const onDividerPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      applyWidth(drag.startWidth + (e.clientX - drag.startX));
    },
    [applyWidth],
  );

  const onDividerPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragging(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
      commitWidth();
    },
    [commitWidth],
  );
  // มุมมองรายการ = ทำเหมือนจอมือถือทุกความกว้าง (เปิดอ่านแล้วแทนที่รายการ)
  const listOnly = pane === "list";

  return (
    <HotkeysProvider initiallyActiveScopes={[MAIL_HOTKEY_SCOPE]}>
      {/* บอกบานอ่านว่ากำลังลากตัวแบ่งอยู่ — ระหว่างนั้นห้ามวัด/สลับโหมดย่อ (กันเนื้อหากระพริบ) */}
      <MailPaneResizeContext.Provider value={dragging}>
        <div
          className={cn(
            "flex h-full min-h-[24rem] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm",
            // ลากอยู่ = ห้ามให้เบราว์เซอร์ไฮไลต์ข้อความในรายการ/บานอ่านตามเมาส์
            dragging && "select-none",
          )}
          style={{ "--mail-list-w": `${listWidth}px` } as CSSProperties}
        >
          <section
            className={cn(
              "flex min-h-0 w-full flex-col border-gray-200",
              !listOnly && "lg:w-[var(--mail-list-w)] lg:shrink-0 lg:border-r",
              activeId && (listOnly ? "hidden" : "hidden lg:flex"),
            )}
          >
            <MailToolbar
              boxLabel={currentBoxLabel}
              unreadCount={unreadCount}
              totalLabel={totalLabel}
              search={search}
              onSearchChange={setSearch}
              filters={filters}
              onFiltersChange={setFilters}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters((v) => !v)}
              onRefresh={() => void loadFirstPage("refresh")}
              refreshing={refreshing}
              onCompose={() => openCompose(null)}
              onOpenShortcuts={() => setShowShortcuts(true)}
              pane={pane}
              onTogglePane={togglePane}
              selectAllState={selectAllState}
              onToggleSelectAll={toggleSelectAll}
              selectAllDisabled={visibleMessages.length === 0}
              onEmptyBox={
                emptyableBox
                  ? () =>
                      emptyBlockedByFilter
                        ? notify.error(
                            null,
                            "ล้างกล่องระหว่างใช้ตัวกรอง/ค้นหาไม่ได้ — ล้างตัวกรองก่อน",
                          )
                        : setEmptyConfirm(true)
                  : undefined
              }
              searchInputRef={searchWrapRef}
            />
            <div className="min-h-0 flex-1">
              <MailList
                ref={listRef}
                messages={visibleMessages}
                loading={loading}
                loadingMore={loadingMore}
                hasMore={hasMore}
                error={error}
                searchTerm={debouncedSearch}
                selectedIds={selectedIds}
                activeId={activeId}
                focusedIndex={focusedIndex}
                newCount={pendingNew.length}
                onApplyNew={applyPendingNew}
                onOpen={(m, i) => (isDrafts ? void openDraft(m) : void openMessage(m, i))}
                onToggleSelect={toggleSelect}
                onToggleStar={(m) => toggleStar([m.id], !m.isFlagged)}
                onSwipeArchive={
                  canArchive ? (m) => enqueueDestructive("archive", [m.id]) : undefined
                }
                onSwipeTrash={canTrash ? (m) => enqueueDestructive("trash", [m.id]) : undefined}
                onLoadMore={() => void loadMore()}
                onRetry={() => void loadFirstPage("initial")}
                onClearSearch={() => setSearch("")}
                onScrollOffsetChange={(offset) => {
                  scrollOffsetRef.current = offset;
                }}
              />
            </div>
          </section>

          {/*
          ตัวแบ่งลากได้ — มีเฉพาะจอ lg ขึ้นไปตอนมุมมอง split (จอแคบ/มุมมองรายการเป็น pane เดียวอยู่แล้ว)
          พื้นที่จับกว้าง 6px (นิ้ว/เมาส์จิ้มติด) แต่เส้นที่เห็นยังบางเท่าเดิม
        */}
          {!listOnly && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="ปรับความกว้างคอลัมน์รายการ"
              aria-valuenow={listWidth}
              aria-valuemin={MAIL_LIST_WIDTH_MIN}
              aria-valuemax={MAIL_LIST_WIDTH_MAX}
              tabIndex={0}
              title="ลากเพื่อปรับความกว้าง (ดับเบิลคลิก = ค่าเริ่มต้น)"
              onPointerDown={onDividerPointerDown}
              onPointerMove={onDividerPointerMove}
              onPointerUp={onDividerPointerUp}
              onPointerCancel={onDividerPointerUp}
              onDoubleClick={() => {
                applyWidth(MAIL_LIST_WIDTH_DEFAULT);
                commitWidth();
              }}
              onKeyDown={(e) => {
                // คีย์บอร์ดต้องขยับได้ด้วย — ตัวแบ่งที่ลากได้ด้วยเมาส์อย่างเดียวคือของที่ใช้ไม่ได้จริง
                const step = e.shiftKey ? 48 : 16;
                if (e.key === "ArrowLeft") applyWidth(widthRef.current - step);
                else if (e.key === "ArrowRight") applyWidth(widthRef.current + step);
                else if (e.key === "Home") applyWidth(MAIL_LIST_WIDTH_DEFAULT);
                else return;
                e.preventDefault();
                commitWidth();
              }}
              className={cn(
                "group hidden w-1.5 shrink-0 cursor-col-resize touch-none items-stretch justify-center",
                "bg-transparent transition-colors hover:bg-gray-100 focus:outline-none",
                "focus-visible:bg-gray-200 lg:flex",
                dragging && "bg-gray-200",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "my-auto h-8 w-px rounded-full bg-gray-300 transition-colors group-hover:bg-gray-400",
                  dragging && "bg-gray-400",
                )}
              />
            </div>
          )}

          <section
            // min-w-0 บังคับ (DESIGN.md §5 ข้อ 6): flex item ค่า default `min-width:auto`
            // ยุบต่ำกว่าความกว้างเนื้อหาไม่ได้ ⇒ เมลที่มีตาราง/บรรทัดกว้าง ดันบานอ่านให้กว้างเกินจอ
            // แล้วเนื้อหาถูกตัดขอบขวา (เห็นชัดกับเมลที่ถูกส่งต่อมาจากระบบธนาคาร/หลักทรัพย์)
            className={cn(
              "min-h-0 min-w-0 flex-1",
              !activeId && (listOnly ? "hidden" : "hidden lg:block"),
            )}
          >
            <MailReader
              detail={detail}
              loading={detailLoading}
              error={detailError}
              flagged={!!activeMessage?.isFlagged}
              onRetry={() => activeMessage && void openMessage(activeMessage, focusedIndex)}
              onBack={closePane}
              canArchive={canArchive}
              canTrash={canTrash}
              /* มุมมองรายการ = บานอ่านยืนเดี่ยวกินเต็มจอ ⇒ ต้องมีทางกลับที่เห็นเสมอ + คอลัมน์กว้างขึ้น */
              standalone={listOnly}
              basePath={basePath}
              /* อยู่ในโฟลเดอร์ของผู้ใช้เอง = เดาปลายทางของกฎใหม่ให้เป็นโฟลเดอร์นั้น */
              currentFolderId={selector.kind === "folder" ? selector.mailboxId : null}
              /* ปุ่มแจ้งสแปมมีทีละตัวตามกล่องที่ยืนอยู่ — ในจดหมายขยะให้ "ไม่ใช่สแปม" เท่านั้น */
              onMarkSpam={
                canReportSpam && junkMailboxId && activeId ? () => markSpam([activeId]) : undefined
              }
              onNotSpam={
                inJunk && inboxMailboxId && activeId ? () => markNotSpam([activeId]) : undefined
              }
              onArchive={() => activeId && enqueueDestructive("archive", [activeId])}
              onTrash={() => activeId && enqueueDestructive("trash", [activeId])}
              onToggleStar={() => activeId && toggleStar([activeId], !activeMessage?.isFlagged)}
              moveTargets={moveTargets}
              onMove={(folder) => activeId && void moveToFolder([activeId], folder)}
              onReply={() => openReply("reply")}
              onReplyAll={() => openReply("replyAll")}
              onForward={() => openReply("forward")}
            />
          </section>
        </div>
      </MailPaneResizeContext.Provider>

      {/* FAB เขียนเมล — เฉพาะมือถือ ตำแหน่งที่นิ้วโป้งเอื้อมถึง (UI_SPEC §8)
          ซ่อนตอนเปิดอ่าน/เลือกหลายฉบับ เพื่อไม่บังปุ่มอื่น */}
      {!activeId && selectedIds.size === 0 && (
        <Button
          size="icon"
          aria-label="เขียนอีเมลใหม่"
          className="fixed bottom-5 right-5 z-20 h-14 w-14 rounded-full shadow-lg sm:hidden"
          onClick={() => openCompose(null)}
        >
          <PenLine className="h-6 w-6" />
        </Button>
      )}

      {selectedIds.size > 0 && (
        <BulkActionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReadState(Array.from(selectedIds), false, "thread")}
          >
            <MailOpen className="h-4 w-4" />
            ทำเป็นอ่านแล้ว
          </Button>
          {moveTargets.length > 0 && (
            <Dropdown
              label="ย้ายไป"
              placement="top-start"
              className="h-8"
              minWidth={220}
              leadingIcon={<FolderInput className="h-4 w-4" />}
              items={moveTargets.map((f) => ({
                key: f.id,
                label: f.path,
                onClick: () => void moveToFolder(Array.from(selectedIds), f),
              }))}
            />
          )}
          {canArchive && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => enqueueDestructive("archive", Array.from(selectedIds))}
            >
              <Archive className="h-4 w-4" />
              เก็บเข้าคลัง
            </Button>
          )}
          {canTrash && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => enqueueDestructive("trash", Array.from(selectedIds))}
            >
              <Trash2 className="h-4 w-4" />
              ลบ
            </Button>
          )}
        </BulkActionBar>
      )}

      <MailCompose
        open={composeOpen}
        seed={composeSeed}
        identities={identities}
        defaultEmail={selfEmail}
        onClose={() => setComposeOpen(false)}
        onSend={enqueueSend}
      />

      <ConfirmDeleteDialog
        open={emptyConfirm}
        onOpenChange={(v) => !emptying && setEmptyConfirm(v)}
        title={emptyableBox === "junk" ? "ล้างจดหมายขยะ" : "ล้างถังขยะ"}
        description={
          emptyBoxTotal === null
            ? "เมลทั้งหมดในกล่องนี้จะถูกลบถาวร — กู้คืนไม่ได้"
            : `เมลทั้งหมดในกล่องนี้ (${emptyBoxTotal} ฉบับ) จะถูกลบถาวร — กู้คืนไม่ได้`
        }
        confirmLabel={emptying ? "กำลังลบ…" : "ลบถาวร"}
        loading={emptying}
        onConfirm={() => void emptyBox()}
      />

      <MailShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
    </HotkeysProvider>
  );
}
