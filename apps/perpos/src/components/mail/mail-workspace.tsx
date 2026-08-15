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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HotkeysProvider } from "react-hotkeys-hook";
import { Archive, MailOpen, Trash2 } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { notify } from "@/lib/toast";
import { UNDO_TOAST_MS, dismissUndoToast, showUndoToast } from "@/components/ui/undo-toast";
import type {
  MailBoxKey,
  MailBulkAction,
  MailMessage,
  MailScope,
  MailThreadDetail,
  MailboxSummary,
} from "@/lib/mail/types";
import { MailList, type MailListHandle } from "@/components/mail/mail-list";
import { MailReader } from "@/components/mail/mail-reader";
import { MailToolbar, type MailFilters } from "@/components/mail/mail-toolbar";
import { MailShortcutsDialog } from "@/components/mail/mail-shortcuts-dialog";
import {
  MAIL_HOTKEY_SCOPE,
  useMailShortcuts,
  type MailShortcutHandlers,
} from "@/components/mail/use-mail-shortcuts";

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

const ACTION_LABEL: Record<DestructiveAction, string> = {
  archive: "เก็บเข้าคลังแล้ว",
  trash: "ย้ายไปถังขยะแล้ว",
};

export function MailWorkspace({
  box,
  boxLabel,
  basePath,
}: {
  box: MailBoxKey;
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
  const [showShortcuts, setShowShortcuts] = useState(false);

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
      const d = await callMailApi<{ mailboxes: MailboxSummary[]; email: string }>(
        "/api/mail/mailboxes",
      );
      setMailboxes(d.mailboxes ?? []);
    } catch {
      /* ตัวเลขสรุปพลาดได้ ไม่ต้องรบกวนผู้ใช้ — รายการเมลคือของหลัก */
    }
  }, []);

  /**
   * ตัวเลข "ยังไม่ได้อ่าน" ต้องขยับตามสิ่งที่ผู้ใช้เพิ่งทำ ไม่ใช่ค้างค่าตอนเปิดกล่อง
   * → เรียกซ้ำหลัง อ่าน/ลบ/เก็บ/รีเฟรช/มีเมลใหม่ · debounce 1 วิ กันยิงรัวตอนกดหลายฉบับติดกัน
   */
  const mailboxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleMailboxRefresh = useCallback(() => {
    if (mailboxTimerRef.current) clearTimeout(mailboxTimerRef.current);
    mailboxTimerRef.current = setTimeout(() => void loadMailboxes(), 1000);
  }, [loadMailboxes]);

  useEffect(() => {
    void loadMailboxes();
  }, [box, loadMailboxes]);

  useEffect(
    () => () => {
      if (mailboxTimerRef.current) clearTimeout(mailboxTimerRef.current);
    },
    [],
  );

  const loadFirstPage = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
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
      } catch (e) {
        if (e instanceof MailSessionExpiredError) return handleExpired();
        setError(e instanceof Error ? e.message : GENERIC_ERROR);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [buildQuery, handleExpired, scheduleMailboxRefresh],
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
        scheduleMailboxRefresh();
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
  }, [buildQuery, loading, scheduleMailboxRefresh]);

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

  const unreadCount = useMemo(() => {
    const mb = mailboxes.find((m) => m.key === box);
    return mb ? mb.unreadCount : null;
  }, [box, mailboxes]);

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
        scheduleMailboxRefresh();
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
        scheduleMailboxRefresh();
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

  // flush คิวที่ค้างเมื่อกำลังจะออกจากหน้า — ไม่งั้นการกระทำหายเงียบ
  const flushRef = useRef(flushQueue);
  flushRef.current = flushQueue;
  useEffect(() => {
    const flushAll = () => {
      for (const action of Array.from(queueRef.current.keys())) {
        void flushRef.current(action, true);
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
      if (m) void openMessage(m, index);
    },
    [openMessage],
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
  const canArchive = box !== "archive";
  const canTrash = box !== "trash";

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
    router,
    setReadState,
    toggleSelect,
    toggleStar,
  ]);

  useMailShortcuts(shortcutHandlers, !showShortcuts);

  const activeMessage = useMemo(
    () => messages.find((m) => m.id === activeId) ?? null,
    [activeId, messages],
  );

  const totalLabel = total === null ? null : `${total} ฉบับ`;

  return (
    <HotkeysProvider initiallyActiveScopes={[MAIL_HOTKEY_SCOPE]}>
      <div className="flex h-full min-h-[24rem] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <section
          className={cn(
            "flex min-h-0 w-full flex-col border-gray-200 lg:w-[380px] lg:shrink-0 lg:border-r",
            activeId && "hidden lg:flex",
          )}
        >
          <MailToolbar
            boxLabel={boxLabel}
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
            onOpenShortcuts={() => setShowShortcuts(true)}
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
              onOpen={(m, i) => void openMessage(m, i)}
              onToggleSelect={toggleSelect}
              onToggleStar={(m) => toggleStar([m.id], !m.isFlagged)}
              onLoadMore={() => void loadMore()}
              onRetry={() => void loadFirstPage("initial")}
              onClearSearch={() => setSearch("")}
              onScrollOffsetChange={(offset) => {
                scrollOffsetRef.current = offset;
              }}
            />
          </div>
        </section>

        <section className={cn("min-h-0 flex-1", !activeId && "hidden lg:block")}>
          <MailReader
            detail={detail}
            loading={detailLoading}
            error={detailError}
            flagged={!!activeMessage?.isFlagged}
            onRetry={() => activeMessage && void openMessage(activeMessage, focusedIndex)}
            onBack={closePane}
            canArchive={canArchive}
            canTrash={canTrash}
            onArchive={() => activeId && enqueueDestructive("archive", [activeId])}
            onTrash={() => activeId && enqueueDestructive("trash", [activeId])}
            onToggleStar={() => activeId && toggleStar([activeId], !activeMessage?.isFlagged)}
          />
        </section>
      </div>

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

      <MailShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
    </HotkeysProvider>
  );
}
