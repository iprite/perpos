"use client";

/**
 * ChatClient — ห้องถาม-ตอบของผู้ช่วยวิเคราะห์ธุรกิจ (contract §4 Phase 1 ข้อ 6)
 *
 * หน้าเป็น **hybrid**: server ดึง initial (thread + ข้อความ + metric ที่ตอบได้) แล้วส่งมาที่นี่
 * ส่วน mutation (ถาม / สลับ thread / feedback) ทำฝั่ง client ผ่าน `/api/bi/*`
 * — ไม่มี fetch ซ้ำตอน mount (SERVER_COMPONENT_PATTERN)
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, MessagesSquare, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Text, Title } from "@/components/ui/typography";
import { CustomSelect } from "@/components/ui/custom-select";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { notify } from "@/lib/toast";
import type { BiAnswer, BiMessage, BiMetricSummary, BiThread } from "@/lib/bi/types";
import { AnswerCard } from "./answer-card";
import cn from "@core/utils/class-names";

export interface ChatTurn {
  key: string;
  question: string;
  answer: BiAnswer | null;
  pending: boolean;
  feedback: "up" | "down" | null;
  /** เวลาที่ถาม (ISO) — แสดงกำกับคำตอบจากประวัติ */
  createdAt?: string;
  /** true = มาจากประวัติที่บันทึกไว้ */
  historical?: boolean;
}

export interface ChatClientProps {
  orgId: string;
  orgSlug: string;
  canWrite: boolean;
  threads: BiThread[];
  activeThreadId: string | null;
  messages: BiMessage[];
  metrics: BiMetricSummary[];
  initialQuestion?: string;
}

async function accessToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

/**
 * แปลงข้อความที่บันทึกไว้เป็น turn ที่ AnswerCard เรนเดอร์ได้ **ครบ 5 ส่วน**
 * — บรรทัดนิยาม / คำถามต่อยอด / วิธีคำนวณ / truncated อ่านจาก `answer_meta` ตรง ๆ
 *   (`answer_meta = null` = ข้อความเก่าก่อนมีคอลัมน์นี้ → ซ่อนส่วนนั้น ไม่ throw)
 */
export function buildTurnsFromMessages(
  messages: BiMessage[],
  metrics: BiMetricSummary[],
): ChatTurn[] {
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const turns: ChatTurn[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      turns.push({
        key: msg.id,
        question: msg.content,
        answer: null,
        pending: false,
        feedback: null,
        createdAt: msg.created_at,
        historical: true,
      });
      continue;
    }

    const metric = msg.metric_key ? byKey.get(msg.metric_key) : undefined;
    const meta = msg.answer_meta;

    const answer: BiAnswer = {
      threadId: msg.thread_id,
      messageId: msg.id,
      status: meta?.answer_status ?? "answered",
      answer: { bullets: msg.content ? msg.content.split("\n").filter(Boolean) : [] },
      // metric ที่ถูก deprecate หรืออยู่นอกสิทธิ์ของผู้อ่าน → บอกตรง ๆ ดีกว่าเงียบไม่มีหัวข้อ
      metric: metric
        ? {
            key: metric.key,
            label_th: metric.label_th,
            definition_th: metric.definition_th,
            time_basis: metric.time_basis,
          }
        : msg.metric_key
          ? {
              key: msg.metric_key,
              label_th: "ตัวชี้วัดนี้ไม่พร้อมใช้งานแล้ว (ถูกยกเลิกหรืออยู่นอกสิทธิ์ของคุณ)",
              definition_th: "",
              time_basis: null,
            }
          : null,
      params: msg.params ?? {},
      chart: msg.chart_spec,
      rows: msg.result_rows ?? [],
      row_count: msg.result_row_count ?? msg.result_rows?.length ?? 0,
      truncated: meta?.truncated ?? false,
      definition_line: meta?.definition_line ?? "",
      follow_ups: meta?.follow_ups ?? [],
      work: meta?.work ?? null,
    };

    const last = turns[turns.length - 1];
    if (last && last.answer === null) {
      last.answer = answer;
      last.feedback = msg.feedback ?? null;
    } else
      turns.push({
        key: msg.id,
        question: "",
        answer,
        pending: false,
        feedback: msg.feedback ?? null,
        createdAt: msg.created_at,
        historical: true,
      });
  }

  return turns;
}

export function ChatClient(props: ChatClientProps) {
  const { orgId, metrics, canWrite } = props;
  const router = useRouter();

  const [threads, setThreads] = React.useState<BiThread[]>(props.threads);
  const [threadId, setThreadId] = React.useState<string | null>(props.activeThreadId);
  const [turns, setTurns] = React.useState<ChatTurn[]>(() =>
    buildTurnsFromMessages(props.messages, props.metrics),
  );
  const [question, setQuestion] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  const askedInitial = React.useRef(false);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, busy]);

  const ask = React.useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      if (!canWrite) {
        notify.error(new Error("บทบาทของคุณดูประวัติได้อย่างเดียว"), "ไม่มีสิทธิ์ถามคำถาม");
        return;
      }

      const key = `t-${Date.now()}`;
      setBusy(true);
      setQuestion("");
      setTurns((prev) => [
        ...prev,
        { key, question: q, answer: null, pending: true, feedback: null },
      ]);

      try {
        const token = await accessToken();
        const post = async (tid: string | null) => {
          const res = await fetch("/api/bi/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ orgId, question: q, threadId: tid }),
          });
          return { res, json: (await res.json()) as BiAnswer & { error?: string } };
        };

        let { res, json } = await post(threadId);

        // 404 = thread นี้ไม่ใช่ของเรา (ลิงก์เก่า `?thread=` / สลับบัญชี)
        // → ทิ้ง thread ที่ค้าง แล้วเริ่มบทสนทนาใหม่ให้เลย ไม่ต้องให้ผู้ใช้เจอ error ดิบ
        if (res.status === 404 && threadId) {
          setThreadId(null);
          setTurns((prev) => prev.filter((t) => t.key === key));
          router.replace(`/${props.orgSlug}/bi`, { scroll: false });
          notify.info("ไม่พบบทสนทนานี้ เริ่มบทสนทนาใหม่ให้แล้ว");
          ({ res, json } = await post(null));
        }

        if (!res.ok) throw new Error(json.error || "ถามไม่สำเร็จ");

        setTurns((prev) =>
          prev.map((t) => (t.key === key ? { ...t, answer: json, pending: false } : t)),
        );
        if (json.threadId && json.threadId !== threadId) {
          setThreadId(json.threadId);
          setThreads((prev) =>
            prev.some((p) => p.id === json.threadId)
              ? prev
              : [
                  {
                    id: json.threadId,
                    org_id: orgId,
                    created_by: "",
                    title: q.slice(0, 60),
                    last_message_at: new Date().toISOString(),
                    preferences: {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  ...prev,
                ],
          );
        }
      } catch (e) {
        setTurns((prev) => prev.filter((t) => t.key !== key));
        notify.error(e, "ถามไม่สำเร็จ กรุณาลองใหม่");
      } finally {
        setBusy(false);
      }
    },
    [busy, canWrite, orgId, threadId, router, props.orgSlug],
  );

  // คำถามที่ส่งมาทาง ?q= (ลิงก์จากหน้า "ถามอะไรได้บ้าง") — ถามให้อัตโนมัติครั้งเดียว
  React.useEffect(() => {
    if (askedInitial.current) return;
    askedInitial.current = true;
    const q = props.initialQuestion?.trim();
    if (q && canWrite) void ask(q);
  }, [ask, canWrite, props.initialQuestion]);

  const switchThread = async (id: string) => {
    if (id === threadId || switching) return;
    setSwitching(true);
    try {
      const token = await accessToken();
      const res = await fetch(`/api/bi/threads/${id}?orgId=${encodeURIComponent(orgId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { messages?: BiMessage[]; error?: string };

      // thread ไม่ใช่ของเราแล้ว (ลบไป/สลับบัญชี) → เอาออกจากรายการ + เริ่มใหม่ ไม่โชว์ error ดิบ
      if (res.status === 404) {
        setThreads((prev) => prev.filter((t) => t.id !== id));
        setThreadId(null);
        setTurns([]);
        router.replace(`/${props.orgSlug}/bi`, { scroll: false });
        notify.info("ไม่พบบทสนทนานี้ เริ่มบทสนทนาใหม่ให้แล้ว");
        return;
      }
      if (!res.ok) throw new Error(json.error || "เปิดบทสนทนาไม่สำเร็จ");
      setThreadId(id);
      setTurns(buildTurnsFromMessages(json.messages ?? [], metrics));
      router.replace(`/${props.orgSlug}/bi?thread=${id}`, { scroll: false });
    } catch (e) {
      notify.error(e, "เปิดบทสนทนาไม่สำเร็จ");
    } finally {
      setSwitching(false);
    }
  };

  /**
   * Enter = ถาม · Shift+Enter = ขึ้นบรรทัดใหม่ · ระหว่างรอคำตอบ (busy) ไม่ทำอะไร (กันถามซ้ำ)
   * ดักที่กล่องครอบ ไม่ใช่ที่ <Textarea> โดยตรง — event bubble ขึ้นมาเสมอ
   * ไม่ว่า component ชั้นในจะจัดการ prop อย่างไร · ข้าม keystroke ที่เป็นการยืนยันคำจาก IME (ภาษาไทย/ญี่ปุ่น)
   */
  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };
    if (native.isComposing || native.keyCode === 229) return;
    e.preventDefault();
    if (!canWrite || busy) return;
    void ask(question);
  };

  const newThread = () => {
    setThreadId(null);
    setTurns([]);
    setQuestion("");
    router.replace(`/${props.orgSlug}/bi`, { scroll: false });
    notify.info("เริ่มบทสนทนาใหม่แล้ว");
  };

  const sendFeedback = async (messageId: string, value: "up" | "down", note?: string) => {
    setTurns((prev) =>
      prev.map((t) => (t.answer?.messageId === messageId ? { ...t, feedback: value } : t)),
    );
    try {
      const token = await accessToken();
      const res = await fetch("/api/bi/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId, messageId, feedback: value, note }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "บันทึกความเห็นไม่สำเร็จ");
      notify.success(value === "up" ? "ขอบคุณสำหรับความเห็น" : "รับทราบ จะนำไปปรับปรุงนิยาม");
    } catch (e) {
      setTurns((prev) =>
        prev.map((t) => (t.answer?.messageId === messageId ? { ...t, feedback: null } : t)),
      );
      notify.error(e, "บันทึกความเห็นไม่สำเร็จ");
    }
  };

  const threadOptions = React.useMemo(
    () =>
      threads.map((t) => ({
        value: t.id,
        label: t.title?.trim() || "บทสนทนาไม่มีชื่อ",
      })),
    [threads],
  );

  return (
    <div className="space-y-4">
      {/* แถบเลือกบทสนทนา */}
      <div className="flex flex-wrap items-center gap-2">
        <MessagesSquare className="h-4 w-4 text-gray-400" />
        <CustomSelect
          className="w-64"
          value={threadId ?? ""}
          placeholder="ประวัติการถาม"
          onChange={(v) => {
            if (v) void switchThread(v);
          }}
          options={threadOptions}
        />
        <Button variant="outline" size="sm" onClick={newThread} disabled={busy}>
          <MessageSquarePlus className="mr-1.5 h-4 w-4" />
          บทสนทนาใหม่
        </Button>
      </div>

      {/* บทสนทนา */}
      {turns.length === 0 && !busy ? (
        <EmptyChat metrics={metrics} onAsk={ask} disabled={!canWrite} />
      ) : (
        <div className="space-y-5">
          {turns.map((turn) => (
            <div key={turn.key} className="space-y-2.5">
              {turn.question ? <QuestionBubble text={turn.question} /> : null}
              {turn.pending ? (
                <AnswerSkeleton />
              ) : turn.answer ? (
                <AnswerCard
                  answer={turn.answer}
                  metrics={metrics}
                  orgSlug={props.orgSlug}
                  question={turn.question}
                  createdAt={turn.historical ? turn.createdAt : undefined}
                  onAsk={ask}
                  feedback={turn.feedback}
                  onFeedback={
                    // ประวัติกดให้คะแนนได้แล้ว — ค่าถูกเก็บใน bi_query_log และอ่านกลับมาได้
                    canWrite && turn.answer.messageId
                      ? (v, note) => void sendFeedback(turn.answer!.messageId, v, note)
                      : undefined
                  }
                  disabled={busy}
                />
              ) : null}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* ช่องพิมพ์คำถาม — ดัก Enter ที่ระดับกล่อง (event bubble จาก textarea) เพื่อให้ทำงานแน่นอน */}
      <div
        className="sticky bottom-0 space-y-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
        onKeyDown={handleComposerKeyDown}
      >
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          disabled={!canWrite || busy}
          placeholder={
            canWrite
              ? "ถามเป็นภาษาไทยได้เลย เช่น มูลค่าพอร์ตเดือนนี้แยกตามหน่วยงาน"
              : "บทบาทของคุณดูประวัติได้อย่างเดียว"
          }
        />
        <div className="flex items-center justify-between gap-2">
          <Text className="text-xs text-gray-500">
            {busy
              ? "กำลังหาคำตอบจากข้อมูลจริง (ปกติ 4–8 วินาที)…"
              : "กด Enter เพื่อถาม · Shift+Enter ขึ้นบรรทัดใหม่"}
          </Text>
          <Button
            size="sm"
            disabled={!canWrite || busy || !question.trim()}
            onClick={() => void ask(question)}
          >
            <Send className="mr-1.5 h-4 w-4" />
            {busy ? "กำลังถาม…" : "ถาม"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuestionBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3.5 py-2 text-sm leading-6 text-white">
        {text}
      </div>
    </div>
  );
}

/** โครงคำตอบระหว่างรอ — skeleton ไม่ใช่ spinner กลางจอ (DESIGN §9) */
function AnswerSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <Text className="text-xs text-gray-500">
        กำลังหานิยามที่ตรงกับคำถาม แล้วดึงตัวเลขจากฐานข้อมูล…
      </Text>
      <div className="animate-pulse space-y-2.5">
        <div className="h-3 w-3/4 rounded bg-gray-100" />
        <div className="h-3 w-2/3 rounded bg-gray-100" />
        <div className="h-40 rounded-lg bg-gray-100" />
        <div className="h-3 w-1/2 rounded bg-gray-100" />
      </div>
    </div>
  );
}

/** สถานะว่าง — คำถามตัวอย่างจาก metric ที่ตอบได้จริง (กดแล้วถามเลย) */
function EmptyChat({
  metrics,
  onAsk,
  disabled,
}: {
  metrics: BiMetricSummary[];
  onAsk: (q: string) => void;
  disabled?: boolean;
}) {
  const samples = metrics.slice(0, 6);

  return (
    <div className="flex flex-col items-center rounded-xl border border-gray-200 bg-white px-4 py-12 text-center shadow-sm">
      <div className="mb-4 rounded-full bg-gray-100 p-4">
        <Sparkles className="h-8 w-8 text-gray-400" />
      </div>
      <Title as="h3" className="text-sm font-medium text-gray-900">
        ถามข้อมูลธุรกิจของคุณได้เลย
      </Title>
      <Text className="mt-1 max-w-md text-sm text-gray-500">
        ระบบตอบจากตัวเลขจริงในระบบ พร้อมบอกนิยามและช่วงเวลาที่ใช้ทุกครั้ง
        {samples.length > 0 ? " ลองกดคำถามตัวอย่างด้านล่าง" : ""}
      </Text>

      {samples.length > 0 ? (
        <div className={cn("mt-5 flex w-full max-w-2xl flex-wrap justify-center gap-2")}>
          {samples.map((m) => (
            <Button
              key={m.key}
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onAsk(m.label_th)}
              className="max-w-full whitespace-normal text-left"
            >
              {m.label_th}
            </Button>
          ))}
        </div>
      ) : (
        <Text className="mt-4 max-w-md text-sm text-gray-500">
          ยังไม่มีตัวชี้วัดที่ยืนยันนิยามแล้วสำหรับบทบาทของคุณ — ติดต่อผู้ดูแลระบบเพื่อเปิดใช้งาน
        </Text>
      )}
    </div>
  );
}
