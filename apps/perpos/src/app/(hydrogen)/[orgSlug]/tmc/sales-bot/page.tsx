"use client";

/**
 * ผู้ช่วยขาย TMC (@tmcvilla) — จัดการคลังความรู้ของบอท, เคสที่รอแอดมิน, และตั้งค่าบอท
 *
 * หน้านี้เป็น client component โดยตั้งใจ (CRUD หนัก + poll เคสใหม่) ตามข้อยกเว้นใน AGENTS.md
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { backendUrl } from "@/lib/backend";
import { toast } from "@/lib/toast";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import { FilterBar, FilterSearch, FilterClear } from "@/components/ui/filter-bar";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableLoading,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Bot,
  Inbox,
  LifeBuoy,
  MessageSquare,
  Plus,
  Power,
  PowerOff,
  Copy,
  RefreshCw,
  Settings2,
  Sparkles,
  Tag,
  Undo2,
  Unlink,
  UserCheck,
  Users,
} from "lucide-react";

const TMC_ORG_ID = "1f52618c-09c4-49c5-a929-ea5060f26e7d";

const CATEGORIES = [
  "บ้านพัก",
  "ราคา",
  "ห้องนอน",
  "เตียงเสริม",
  "ส่วนลด",
  "สัตว์เลี้ยง",
  "การจอง",
  "ทั่วไป",
];

type Tab = "kb" | "inbox" | "chats" | "settings";

interface Article {
  id: string;
  category: string;
  title: string;
  content: string;
  keywords: string[];
  is_active: boolean;
  sort_order: number;
  embedded_at: string | null;
  updated_at: string;
  source: string;
  source_note: string | null;
  previous_content: string | null;
}

interface EscalationCase {
  id: string;
  contact_id: string;
  reason: "no_answer" | "request_human";
  question: string;
  best_similarity: number | null;
  status: string;
  notified_at: string | null;
  created_at: string;
  tmc_chat_contacts: {
    display_name: string | null;
    line_user_id: string;
    mode: string;
    human_until: string | null;
  } | null;
}

interface Contact {
  id: string;
  line_user_id: string;
  display_name: string | null;
  mode: string;
  human_until: string | null;
  is_blocked: boolean;
  message_count: number;
  escalation_count: number;
  last_message_at: string | null;
  last_message_text: string | null;
}

interface ChatMessage {
  id: string;
  role: "customer" | "bot" | "admin" | "system";
  text: string;
  similarity: number | null;
  is_escalation: boolean;
  created_at: string;
}

interface BotSettings {
  is_enabled: boolean;
  bot_name: string;
  greeting_text: string;
  fallback_text: string;
  handoff_text: string;
  min_similarity: number;
  human_mode_minutes: number;
  daily_message_cap: number;
  notify_group_id: string | null;
  notify_group_name: string | null;
  notify_linked_at: string | null;
  link_code: string | null;
  link_code_expires_at: string | null;
  bot_mode: "sales" | "service" | "both";
  test_mode: boolean;
  test_line_user_ids: string[];
}

const EMPTY_FORM = {
  id: "",
  category: "ทั่วไป",
  title: "",
  content: "",
  keywords: "",
  isActive: true,
  sortOrder: 0,
  source: "web",
  sourceNote: null as string | null,
  hasPrevious: false,
};

function thaiDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TmcSalesBotPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [tab, setTab] = useState<Tab>("kb");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [articles, setArticles] = useState<Article[]>([]);
  const [cases, setCases] = useState<EscalationCase[]>([]);
  const [caseStatus, setCaseStatus] = useState("open");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [linkCode, setLinkCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [lineConfigured, setLineConfigured] = useState(true);
  const [stats, setStats] = useState({ articles: 0, pendingEmbed: 0, openCases: 0, contacts: 0 });

  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formOpen, setFormOpen] = useState(false);
  const [convo, setConvo] = useState<{ contact: Contact | null; messages: ChatMessage[] } | null>(
    null,
  );

  const headers = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }, [supabase]);

  // ─── โหลดข้อมูล ────────────────────────────────────────────────────────────

  const loadMeta = useCallback(async () => {
    const h = await headers();
    const res = await fetch(backendUrl(`/tmc/sales-bot?orgId=${TMC_ORG_ID}`), { headers: h });
    if (!res.ok) return;
    const json = await res.json();
    setSettings(json.settings);
    // รหัสผูกกลุ่มที่ขอไว้แล้วยังไม่หมดอายุ ต้องกลับมาโชว์เมื่อ refresh หน้า
    // (ไม่งั้นแอดมินปิดหน้าไปแล้วรหัสหาย ต้องขอใหม่ทั้งที่ของเดิมยังใช้ได้)
    const pending = json.settings?.link_code as string | null | undefined;
    const pendingExp = json.settings?.link_code_expires_at as string | null | undefined;
    setLinkCode(
      pending && pendingExp && new Date(pendingExp) > new Date()
        ? { code: pending, expiresAt: pendingExp }
        : null,
    );
    setStats(json.stats ?? stats);
    setLineConfigured(json.lineConfigured !== false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers]);

  const loadArticles = useCallback(async () => {
    const h = await headers();
    const res = await fetch(backendUrl(`/tmc/kb?orgId=${TMC_ORG_ID}`), { headers: h });
    setArticles(res.ok ? await res.json() : []);
  }, [headers]);

  const loadCases = useCallback(async () => {
    const h = await headers();
    const res = await fetch(
      backendUrl(`/tmc/sales-bot/inbox?orgId=${TMC_ORG_ID}&status=${caseStatus}`),
      { headers: h },
    );
    const json = res.ok ? await res.json() : { cases: [] };
    setCases(json.cases ?? []);
  }, [headers, caseStatus]);

  const loadContacts = useCallback(async () => {
    const h = await headers();
    const res = await fetch(backendUrl(`/tmc/sales-bot/inbox?orgId=${TMC_ORG_ID}&view=contacts`), {
      headers: h,
    });
    const json = res.ok ? await res.json() : { contacts: [] };
    setContacts(json.contacts ?? []);
  }, [headers]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadMeta(), loadArticles(), loadCases(), loadContacts()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) void loadCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseStatus]);

  // ─── การกระทำ ──────────────────────────────────────────────────────────────

  async function saveArticle() {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("กรอกหัวข้อและเนื้อหาก่อนนะครับ");
      return;
    }
    setBusy(true);
    try {
      const h = await headers();
      const payload = {
        orgId: TMC_ORG_ID,
        title: form.title,
        content: form.content,
        category: form.category,
        keywords: form.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        isActive: form.isActive,
        sortOrder: form.sortOrder,
      };
      const res = form.id
        ? await fetch(backendUrl(`/tmc/kb/${form.id}`), {
            method: "PATCH",
            headers: h,
            body: JSON.stringify(payload),
          })
        : await fetch(backendUrl("/tmc/kb"), {
            method: "POST",
            headers: h,
            body: JSON.stringify(payload),
          });
      if (!res.ok) throw new Error((await res.json()).error ?? "บันทึกไม่สำเร็จ");
      toast.success("บันทึกแล้ว — อย่าลืมกด “อัปเดตความรู้” ให้บอทเรียนของใหม่");
      setFormOpen(false);
      await Promise.all([loadArticles(), loadMeta()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function deleteArticle() {
    if (!form.id) return;
    setBusy(true);
    try {
      const h = await headers();
      const res = await fetch(backendUrl(`/tmc/kb/${form.id}?orgId=${TMC_ORG_ID}`), {
        method: "DELETE",
        headers: h,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "ลบไม่สำเร็จ");
      toast.success("ลบแล้ว");
      setFormOpen(false);
      await Promise.all([loadArticles(), loadMeta()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function restorePrevious() {
    if (!form.id) return;
    setBusy(true);
    try {
      const h = await headers();
      const res = await fetch(backendUrl(`/tmc/kb/${form.id}`), {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({ orgId: TMC_ORG_ID, restorePrevious: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "กู้คืนไม่สำเร็จ");
      toast.success('กู้คืนเนื้อหาเดิมแล้ว — กด "อัปเดตความรู้" เพื่อให้บอทเรียนใหม่');
      setFormOpen(false);
      await Promise.all([loadArticles(), loadMeta()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function reembed(all = false) {
    setBusy(true);
    try {
      const h = await headers();
      const res = await fetch(backendUrl("/tmc/kb/reembed"), {
        method: "POST",
        headers: h,
        body: JSON.stringify({ orgId: TMC_ORG_ID, all }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "อัปเดตความรู้ไม่สำเร็จ");
      if (json.failed?.length) {
        toast.error(`มี ${json.failed.length} บทความที่ฝังไม่สำเร็จ — ลองใหม่อีกครั้ง`);
      } else {
        toast.success(`บอทเรียนรู้แล้ว ${json.articles} บทความ (${json.chunks} ท่อน)`);
      }
      await Promise.all([loadArticles(), loadMeta()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปเดตความรู้ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function patchInbox(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      const h = await headers();
      const res = await fetch(backendUrl("/tmc/sales-bot/inbox"), {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({ orgId: TMC_ORG_ID, ...body }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "ทำรายการไม่สำเร็จ");
      toast.success(okMsg);
      await Promise.all([loadCases(), loadContacts(), loadMeta()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function openConversation(contactId: string) {
    const h = await headers();
    const res = await fetch(
      backendUrl(`/tmc/sales-bot/inbox?orgId=${TMC_ORG_ID}&contactId=${contactId}`),
      { headers: h },
    );
    const json = res.ok ? await res.json() : { messages: [] };
    const contact = contacts.find((c) => c.id === contactId) ?? null;
    setConvo({ contact, messages: json.messages ?? [] });
  }

  async function requestLinkCode() {
    setBusy(true);
    try {
      const h = await headers();
      const res = await fetch(backendUrl("/tmc/sales-bot"), {
        method: "POST",
        headers: h,
        body: JSON.stringify({ orgId: TMC_ORG_ID, action: "link-code" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "ขอรหัสไม่สำเร็จ");
      setLinkCode({ code: json.code, expiresAt: json.expiresAt });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ขอรหัสไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function unlinkGroup() {
    setBusy(true);
    try {
      const h = await headers();
      const res = await fetch(backendUrl("/tmc/sales-bot"), {
        method: "POST",
        headers: h,
        body: JSON.stringify({ orgId: TMC_ORG_ID, action: "unlink-group" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "ยกเลิกไม่สำเร็จ");
      toast.success("ยกเลิกการผูกกลุ่มแล้ว");
      setLinkCode(null);
      await loadMeta();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  /** แก้ค่าบางตัวแล้วบันทึกทันที — ใช้กับสวิตช์บนหัวหน้าที่ต้องมีผลเดี๋ยวนั้น */
  async function patchSettings(partial: Record<string, unknown>, okMsg: string) {
    if (!settings) return;
    setBusy(true);
    try {
      const h = await headers();
      const res = await fetch(backendUrl("/tmc/sales-bot"), {
        method: "PUT",
        headers: h,
        body: JSON.stringify({ orgId: TMC_ORG_ID, ...partial }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "บันทึกไม่สำเร็จ");
      toast.success(okMsg);
      await loadMeta();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    try {
      const h = await headers();
      const res = await fetch(backendUrl("/tmc/sales-bot"), {
        method: "PUT",
        headers: h,
        body: JSON.stringify({
          orgId: TMC_ORG_ID,
          isEnabled: settings.is_enabled,
          botName: settings.bot_name,
          greetingText: settings.greeting_text,
          fallbackText: settings.fallback_text,
          handoffText: settings.handoff_text,
          minSimilarity: settings.min_similarity,
          humanModeMinutes: settings.human_mode_minutes,
          dailyMessageCap: settings.daily_message_cap,
          botMode: settings.bot_mode,
          testMode: settings.test_mode,
          testLineUserIds: settings.test_line_user_ids,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "บันทึกไม่สำเร็จ");
      toast.success("บันทึกการตั้งค่าแล้ว");
      await loadMeta();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  // ─── ตัวกรอง + แบ่งหน้า ────────────────────────────────────────────────────

  const filteredArticles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return articles.filter((a) => {
      if (categoryFilter && a.category !== categoryFilter) return false;
      if (!needle) return true;
      return (
        a.title.toLowerCase().includes(needle) ||
        a.content.toLowerCase().includes(needle) ||
        a.keywords.some((k) => k.toLowerCase().includes(needle))
      );
    });
  }, [articles, q, categoryFilter]);

  const kbPager = usePagination(filteredArticles, {
    pageSize: 15,
    resetKey: `${q}|${categoryFilter}`,
  });
  const casePager = usePagination(cases, { pageSize: 15, resetKey: caseStatus });
  const contactPager = usePagination(contacts, { pageSize: 15 });

  const hasFilter = !!q || !!categoryFilter;

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <PageShell
      title="ผู้ช่วยขาย (LINE @tmcvilla)"
      description="บอทตอบลูกค้าเรื่องเข้าพัก · ตอบไม่ได้หรือลูกค้าขอคุยกับคน จะแจ้งแอดมินทันที"
      icon={<Bot className="h-6 w-6" />}
      width="wide"
      tabs={
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: "kb", label: "คลังความรู้", icon: <BookOpen className="h-4 w-4" /> },
            { value: "inbox", label: "เคสรอแอดมิน", icon: <Inbox className="h-4 w-4" /> },
            { value: "chats", label: "ลูกค้า", icon: <MessageSquare className="h-4 w-4" /> },
            { value: "settings", label: "ตั้งค่าบอท", icon: <Settings2 className="h-4 w-4" /> },
          ]}
        />
      }
      actions={
        <>
          {settings && (
            <>
              <SegmentedControl
                value={settings.bot_mode ?? "sales"}
                onChange={(v) =>
                  patchSettings(
                    { botMode: v },
                    v === "sales"
                      ? "สลับเป็นโหมดการขายแล้ว"
                      : v === "service"
                        ? "สลับเป็นโหมดการบริการแล้ว"
                        : "เปิดทั้งงานขายและงานบริการแล้ว",
                  )
                }
                ariaLabel="โหมดของบอท"
                options={[
                  { value: "sales", label: "การขาย", icon: <Tag className="h-4 w-4" /> },
                  { value: "service", label: "การบริการ", icon: <LifeBuoy className="h-4 w-4" /> },
                  { value: "both", label: "ทั้งสองอย่าง", icon: <Sparkles className="h-4 w-4" /> },
                ]}
              />
              <Button
                variant={settings.is_enabled ? "secondary" : "outline"}
                disabled={busy}
                title={settings.is_enabled ? "กดเพื่อปิดบอท" : "กดเพื่อเปิดบอท"}
                onClick={() =>
                  patchSettings(
                    { isEnabled: !settings.is_enabled },
                    settings.is_enabled ? "ปิดบอทแล้ว — บอทจะไม่ตอบลูกค้า" : "เปิดบอทแล้ว",
                  )
                }
              >
                {settings.is_enabled ? (
                  <>
                    <Power className="h-4 w-4 text-green-600" /> บอทเปิดอยู่
                  </>
                ) : (
                  <>
                    <PowerOff className="h-4 w-4 text-gray-400" /> บอทปิดอยู่
                  </>
                )}
              </Button>
            </>
          )}
          {tab === "kb" && (
            <>
              <Button variant="outline" disabled={busy} onClick={() => reembed(false)}>
                <RefreshCw className="h-4 w-4" /> อัปเดตความรู้
              </Button>
              <Button
                onClick={() => {
                  setForm({ ...EMPTY_FORM });
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> เพิ่มความรู้
              </Button>
            </>
          )}
        </>
      }
    >
      {!lineConfigured && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Text className="text-sm font-medium text-amber-800">
            ยังไม่ได้เชื่อม LINE OA @tmcvilla
          </Text>
          <Text className="mt-1 text-xs text-amber-700">
            ต้องตั้งค่า <code>TMC_LINE_CHANNEL_SECRET</code> และ{" "}
            <code>TMC_LINE_CHANNEL_ACCESS_TOKEN</code> บนเซิร์ฟเวอร์ แล้วชี้ Webhook URL ของ
            @tmcvilla มาที่ <code>/api/line/tmc/webhook</code> — ระหว่างนี้บอทจะยังไม่ตอบลูกค้า
          </Text>
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<BookOpen className="h-4 w-4" />}
          label="ความรู้ที่ใช้งาน"
          value={String(stats.articles)}
          sub={stats.pendingEmbed > 0 ? `รออัปเดต ${stats.pendingEmbed} บทความ` : "อัปเดตครบแล้ว"}
          tone={stats.pendingEmbed > 0 ? "warning" : "positive"}
        />
        <StatCard
          icon={<Inbox className="h-4 w-4" />}
          label="เคสรอแอดมิน"
          value={String(stats.openCases)}
          tone={stats.openCases > 0 ? "negative" : "positive"}
          valueColored
        />
        <StatCard
          icon={<MessageSquare className="h-4 w-4" />}
          label="ลูกค้าที่เคยคุย"
          value={String(stats.contacts)}
          tone="info"
        />
        <StatCard
          icon={<Sparkles className="h-4 w-4" />}
          label="สถานะบอท"
          value={settings?.is_enabled ? "เปิดใช้งาน" : "ปิดอยู่"}
          tone={settings?.is_enabled ? "positive" : "neutral"}
          valueColored
        />
      </div>

      {/* ─── คลังความรู้ ─── */}
      {tab === "kb" && (
        <div className="space-y-3">
          <FilterBar>
            <FilterSearch
              value={q}
              onChange={setQ}
              placeholder="ค้นหา หัวข้อ / เนื้อหา / คำที่ลูกค้าถาม"
            />
            <CustomSelect
              value={categoryFilter}
              onChange={setCategoryFilter}
              className="w-40"
              options={[
                { value: "", label: "ทุกหมวด" },
                ...CATEGORIES.map((c) => ({ value: c, label: c })),
              ]}
            />
            <FilterClear
              disabled={!hasFilter}
              onClick={() => {
                setQ("");
                setCategoryFilter("");
              }}
            />
          </FilterBar>

          <Table stickyHeader fillViewport>
            <TableHeader sticky>
              <TableRow>
                <TableHead>หัวข้อ</TableHead>
                <TableHead>หมวด</TableHead>
                <TableHead>คำที่ลูกค้ามักถาม</TableHead>
                <TableHead align="center">สถานะ</TableHead>
                <TableHead align="center">บอทเรียนแล้ว</TableHead>
                <TableHead align="right">อัปเดตล่าสุด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={6} />
              ) : kbPager.rows.length === 0 ? (
                <TableEmpty colSpan={6}>
                  ยังไม่มีความรู้ในคลัง — กด “เพิ่มความรู้” เพื่อสอนบอทเรื่องแรก
                </TableEmpty>
              ) : (
                kbPager.rows.map((a) => (
                  <TableRow
                    key={a.id}
                    clickable
                    onClick={() => {
                      setForm({
                        id: a.id,
                        category: a.category,
                        title: a.title,
                        content: a.content,
                        keywords: (a.keywords ?? []).join(", "),
                        isActive: a.is_active,
                        sortOrder: a.sort_order,
                        source: a.source ?? "web",
                        sourceNote: a.source_note ?? null,
                        hasPrevious: !!a.previous_content,
                      });
                      setFormOpen(true);
                    }}
                  >
                    <TableCell>{a.title}</TableCell>
                    <TableCell>{a.category}</TableCell>
                    <TableCell className="max-w-xs truncate text-gray-500">
                      {(a.keywords ?? []).join(", ") || "—"}
                    </TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={a.is_active ? "success" : "neutral"}>
                        {a.is_active ? "ใช้งาน" : "ปิด"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={a.embedded_at ? "success" : "warning"}>
                        {a.embedded_at ? "เรียนแล้ว" : "รออัปเดต"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell align="right" className="tabular-nums text-gray-500">
                      {thaiDateTime(a.updated_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePager pager={kbPager} unit="บทความ" />
        </div>
      )}

      {/* ─── เคสรอแอดมิน ─── */}
      {tab === "inbox" && (
        <div className="space-y-3">
          <FilterBar>
            <SegmentedControl
              value={caseStatus}
              onChange={setCaseStatus}
              options={[
                { value: "open", label: "รอแอดมิน" },
                { value: "handled", label: "คุยแล้ว" },
                { value: "all", label: "ทั้งหมด" },
              ]}
            />
          </FilterBar>

          <Table stickyHeader fillViewport>
            <TableHeader sticky>
              <TableRow>
                <TableHead>เวลา</TableHead>
                <TableHead>ลูกค้า</TableHead>
                <TableHead>คำถาม</TableHead>
                <TableHead align="center">สาเหตุ</TableHead>
                <TableHead align="center">สถานะ</TableHead>
                <TableHead align="right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={6} />
              ) : casePager.rows.length === 0 ? (
                <TableEmpty colSpan={6}>ไม่มีเคสรอแอดมิน — บอทตอบลูกค้าได้เองทั้งหมด 🎉</TableEmpty>
              ) : (
                casePager.rows.map((c) => (
                  <TableRow key={c.id} clickable onClick={() => openConversation(c.contact_id)}>
                    <TableCell className="tabular-nums">{thaiDateTime(c.created_at)}</TableCell>
                    <TableCell>{c.tmc_chat_contacts?.display_name || "ลูกค้า LINE"}</TableCell>
                    <TableCell className="max-w-md truncate">{c.question}</TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={c.reason === "request_human" ? "info" : "warning"}>
                        {c.reason === "request_human" ? "ขอคุยกับคน" : "บอทตอบไม่ได้"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={c.status === "open" ? "danger" : "success"}>
                        {c.status === "open" ? "รอแอดมิน" : "คุยแล้ว"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell align="right">
                      {c.status === "open" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void patchInbox(
                              { escalationId: c.id, status: "handled" },
                              "ปิดเคสแล้ว",
                            );
                          }}
                        >
                          <UserCheck className="h-4 w-4" /> คุยแล้ว
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePager pager={casePager} unit="เคส" />
        </div>
      )}

      {/* ─── ลูกค้า ─── */}
      {tab === "chats" && (
        <div className="space-y-3">
          <Table stickyHeader fillViewport>
            <TableHeader sticky>
              <TableRow>
                <TableHead>ลูกค้า</TableHead>
                <TableHead>ข้อความล่าสุด</TableHead>
                <TableHead className="tabular-nums" align="right">
                  ข้อความ
                </TableHead>
                <TableHead align="center">ใครตอบอยู่</TableHead>
                <TableHead align="right">คุยล่าสุด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={5} />
              ) : contactPager.rows.length === 0 ? (
                <TableEmpty colSpan={5}>ยังไม่มีลูกค้าทักเข้ามาทาง @tmcvilla</TableEmpty>
              ) : (
                contactPager.rows.map((c) => {
                  const humanActive =
                    c.mode === "human" && !!c.human_until && new Date(c.human_until) > new Date();
                  return (
                    <TableRow key={c.id} clickable onClick={() => openConversation(c.id)}>
                      <TableCell>{c.display_name || "ลูกค้า LINE"}</TableCell>
                      <TableCell className="max-w-md truncate text-gray-500">
                        {c.last_message_text || "—"}
                      </TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {c.message_count}
                      </TableCell>
                      <TableCell align="center">
                        <StatusBadge tone={humanActive ? "info" : "success"}>
                          {humanActive ? "แอดมิน" : "บอท"}
                        </StatusBadge>
                      </TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {thaiDateTime(c.last_message_at)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <TablePager pager={contactPager} unit="ราย" />
        </div>
      )}

      {/* ─── ตั้งค่าบอท ─── */}
      {tab === "settings" && settings && (
        <div className="max-w-2xl space-y-4">
          <div>
            <Label>เปิดใช้งานบอท</Label>
            <SegmentedControl
              size="md"
              value={settings.is_enabled ? "on" : "off"}
              onChange={(v) => setSettings({ ...settings, is_enabled: v === "on" })}
              options={[
                { value: "on", label: "เปิด — บอทตอบลูกค้า" },
                { value: "off", label: "ปิด — เงียบทั้งหมด" },
              ]}
            />
          </div>

          <div>
            <Label htmlFor="botName">ชื่อที่บอทใช้แทนตัวเอง</Label>
            <Input
              id="botName"
              className="mt-1"
              value={settings.bot_name}
              onChange={(e) => setSettings({ ...settings, bot_name: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="greeting">ข้อความทักทาย (ตอนลูกค้าแอด / ทักสั้น ๆ)</Label>
            <textarea
              id="greeting"
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-primary focus:outline-none"
              value={settings.greeting_text}
              onChange={(e) => setSettings({ ...settings, greeting_text: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="fallback">ข้อความเมื่อบอทตอบไม่ได้</Label>
            <textarea
              id="fallback"
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-primary focus:outline-none"
              value={settings.fallback_text}
              onChange={(e) => setSettings({ ...settings, fallback_text: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="handoff">ข้อความเมื่อลูกค้าขอคุยกับแอดมิน</Label>
            <textarea
              id="handoff"
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-primary focus:outline-none"
              value={settings.handoff_text}
              onChange={(e) => setSettings({ ...settings, handoff_text: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="minSim">ความมั่นใจขั้นต่ำ</Label>
              <Input
                id="minSim"
                type="number"
                step="0.05"
                min="0.3"
                max="0.95"
                className="mt-1"
                value={settings.min_similarity}
                onChange={(e) =>
                  setSettings({ ...settings, min_similarity: Number(e.target.value) })
                }
              />
              <Text className="mt-1 text-xs text-gray-500">
                สูง = บอทระวังตัว ส่งต่อแอดมินบ่อยขึ้น
              </Text>
            </div>
            <div>
              <Label htmlFor="humanMin">บอทเงียบกี่นาทีหลังส่งต่อ</Label>
              <Input
                id="humanMin"
                type="number"
                min="5"
                max="1440"
                className="mt-1"
                value={settings.human_mode_minutes}
                onChange={(e) =>
                  setSettings({ ...settings, human_mode_minutes: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label htmlFor="cap">จำกัดข้อความ/คน/วัน</Label>
              <Input
                id="cap"
                type="number"
                min="5"
                max="500"
                className="mt-1"
                value={settings.daily_message_cap}
                onChange={(e) =>
                  setSettings({ ...settings, daily_message_cap: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div>
            <Label>โหมดทดสอบ — จำกัดคนที่บอทตอบ</Label>
            <div className="mt-2 space-y-3 rounded-xl border border-gray-200 p-3">
              <SegmentedControl
                size="md"
                value={settings.test_mode ? "on" : "off"}
                onChange={(v) => setSettings({ ...settings, test_mode: v === "on" })}
                options={[
                  { value: "off", label: "ปิด — ตอบลูกค้าทุกคน" },
                  { value: "on", label: "เปิด — ตอบเฉพาะที่เลือก" },
                ]}
              />
              {settings.test_mode && (
                <>
                  <Text className="text-xs text-gray-500">
                    ลูกค้าที่ไม่ได้เลือก บอทจะไม่ตอบ แต่เปิดเคสให้แอดมินทันที จะได้ไม่มีใครถูกทิ้ง
                  </Text>
                  <div className="max-h-56 space-y-2 overflow-y-auto">
                    {contacts.length === 0 && (
                      <Text className="text-sm text-gray-500">ยังไม่มีลูกค้าในระบบ</Text>
                    )}
                    {contacts.map((c) => {
                      const checked = (settings.test_line_user_ids ?? []).includes(c.line_user_id);
                      return (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            checked={checked}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                test_line_user_ids: e.target.checked
                                  ? [...(settings.test_line_user_ids ?? []), c.line_user_id]
                                  : (settings.test_line_user_ids ?? []).filter(
                                      (id) => id !== c.line_user_id,
                                    ),
                              })
                            }
                          />
                          <span className="text-gray-700">{c.display_name || "ลูกค้า LINE"}</span>
                          <span className="text-xs text-gray-400">({c.message_count} ข้อความ)</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <div>
            <Label>กลุ่ม LINE ที่รับแจ้งเตือน</Label>
            <div className="mt-2 rounded-xl border border-gray-200 p-4">
              {settings.notify_group_id ? (
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge tone="success">ผูกกลุ่มแล้ว</StatusBadge>
                  <Text className="text-sm font-medium text-gray-700">
                    {settings.notify_group_name || "กลุ่ม LINE ของทีมแอดมิน"}
                  </Text>
                  <Text className="text-xs text-gray-400">
                    ผูกเมื่อ {thaiDateTime(settings.notify_linked_at)}
                  </Text>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ms-auto"
                    disabled={busy}
                    onClick={unlinkGroup}
                  >
                    <Unlink className="h-4 w-4" /> ยกเลิกการผูก
                  </Button>
                </div>
              ) : linkCode ? (
                <div className="space-y-3">
                  <Text className="text-sm text-gray-700">
                    เชิญ <span className="font-medium">บอท PERPOS (@perpos)</span>{" "}
                    เข้ากลุ่มของทีมแอดมิน แล้วพิมพ์รหัสนี้ในกลุ่ม
                    <br />
                    <span className="text-xs text-gray-500">
                      (ห้ามเอา @tmcvilla เข้ากลุ่ม — OA นั้นไว้คุยกับลูกค้าเท่านั้น)
                    </span>
                  </Text>
                  <div className="flex flex-wrap items-center gap-3">
                    <code className="rounded-lg bg-gray-100 px-4 py-2 font-mono text-lg font-semibold tracking-widest text-gray-900">
                      {linkCode.code}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(linkCode.code);
                        toast.success("คัดลอกรหัสแล้ว");
                      }}
                    >
                      <Copy className="h-4 w-4" /> คัดลอก
                    </Button>
                    <Button variant="outline" size="sm" disabled={busy} onClick={loadMeta}>
                      <RefreshCw className="h-4 w-4" /> ตรวจสถานะ
                    </Button>
                  </div>
                  <Text className="text-xs text-gray-500">
                    รหัสใช้ได้ครั้งเดียว หมดอายุ {thaiDateTime(linkCode.expiresAt)} ·
                    ผูกสำเร็จแล้วบอทจะตอบยืนยันในกลุ่มทันที
                  </Text>
                </div>
              ) : (
                <div className="space-y-3">
                  <Text className="text-sm text-gray-500">
                    ยังไม่ได้ผูกกลุ่ม — เคสที่รอแอดมินจะขึ้นเฉพาะในหน้านี้ ไม่มีแจ้งเตือนเข้า LINE
                  </Text>
                  <Button variant="outline" disabled={busy} onClick={requestLinkCode}>
                    <Users className="h-4 w-4" /> ขอรหัสผูกกลุ่ม
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button disabled={busy} onClick={saveSettings}>
              {busy ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => reembed(true)}>
              <RefreshCw className="h-4 w-4" /> ฝังความรู้ใหม่ทั้งหมด
            </Button>
          </div>
        </div>
      )}

      {/* ─── กล่องแก้ไขความรู้ ─── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "แก้ไขความรู้" : "เพิ่มความรู้ให้บอท"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              {form.source === "line" && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="info">มาจากกลุ่ม LINE</StatusBadge>
                    {form.hasPrevious && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ms-auto"
                        disabled={busy}
                        onClick={restorePrevious}
                      >
                        <Undo2 className="h-4 w-4" /> กู้คืนเนื้อหาก่อนหน้า
                      </Button>
                    )}
                  </div>
                  {form.sourceNote && (
                    <Text className="mt-2 whitespace-pre-wrap text-xs text-gray-600">
                      ข้อความต้นฉบับที่แอดมินพิมพ์: “{form.sourceNote}”
                    </Text>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Label htmlFor="title">หัวข้อ (คำถามที่ลูกค้าถาม) *</Label>
                  <Input
                    id="title"
                    className="mt-1"
                    placeholder="เช่น ราคาบ้าน 5 ห้องนอนเท่าไหร่"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="cat">หมวด</Label>
                  <CustomSelect
                    value={form.category}
                    onChange={(v) => setForm({ ...form, category: v })}
                    options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="content">เนื้อหาคำตอบ *</Label>
                <textarea
                  id="content"
                  rows={12}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-primary focus:outline-none"
                  placeholder={
                    "เขียนเป็นข้อความที่แอดมินจะตอบลูกค้าจริง ๆ\nเว้นบรรทัดว่างเพื่อแยกย่อหน้า"
                  }
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                />
                <Text className="mt-1 text-xs text-gray-500">
                  บอทจะตอบจากเนื้อหานี้เท่านั้น — ถ้าไม่มีข้อมูล บอทจะส่งต่อให้แอดมินแทนการเดา
                </Text>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Label htmlFor="kw">คำที่ลูกค้ามักใช้ถาม (คั่นด้วยจุลภาค)</Label>
                  <Input
                    id="kw"
                    className="mt-1"
                    placeholder="ราคา, เท่าไหร่, กี่บาท"
                    value={form.keywords}
                    onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  />
                </div>
                <div>
                  <Label>สถานะ</Label>
                  <SegmentedControl
                    size="md"
                    value={form.isActive ? "on" : "off"}
                    onChange={(v) => setForm({ ...form, isActive: v === "on" })}
                    options={[
                      { value: "on", label: "ใช้งาน" },
                      { value: "off", label: "ปิด" },
                    ]}
                  />
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            {form.id && (
              <Button
                variant="destructive"
                className="mr-auto"
                disabled={busy}
                onClick={deleteArticle}
              >
                ลบ
              </Button>
            )}
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              ยกเลิก
            </Button>
            <Button disabled={busy} onClick={saveArticle}>
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── กล่องดูบทสนทนา ─── */}
      <Dialog open={!!convo} onOpenChange={(o) => !o && setConvo(null)}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{convo?.contact?.display_name || "บทสนทนากับลูกค้า"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              {(convo?.messages ?? []).length === 0 && (
                <Text className="text-sm text-gray-500">ยังไม่มีข้อความ</Text>
              )}
              {(convo?.messages ?? []).map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === "customer"
                      ? "max-w-[85%] rounded-xl bg-gray-100 px-3 py-2"
                      : "ml-auto max-w-[85%] rounded-xl bg-primary/5 px-3 py-2"
                  }
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Text className="text-xs font-medium text-gray-500">
                      {m.role === "customer" ? "ลูกค้า" : m.role === "bot" ? "บอท" : "แอดมิน"}
                    </Text>
                    <Text className="text-xs text-gray-400">{thaiDateTime(m.created_at)}</Text>
                    {m.is_escalation && <StatusBadge tone="warning">ส่งต่อแอดมิน</StatusBadge>}
                  </div>
                  <Text className="whitespace-pre-wrap text-sm text-gray-700">{m.text}</Text>
                </div>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            {convo?.contact && convo.contact.mode === "human" && (
              <Button
                variant="outline"
                className="mr-auto"
                disabled={busy}
                onClick={() => {
                  void patchInbox(
                    { contactId: convo.contact!.id, mode: "bot" },
                    "คืนให้บอทตอบต่อแล้ว",
                  );
                  setConvo(null);
                }}
              >
                <Bot className="h-4 w-4" /> คืนให้บอทตอบต่อ
              </Button>
            )}
            <Button variant="outline" onClick={() => setConvo(null)}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
