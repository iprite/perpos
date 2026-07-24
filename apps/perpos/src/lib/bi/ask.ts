/**
 * lib/bi/ask.ts — orchestrator 6 สเต็ปของ BI Chat (contract §2)
 *
 *   1. rate-limit (incr_bi_usage)          → เกิน = refused
 *   2. embed + match metric (RBAC + scope) → ไม่เจอ = no_match (+ เสนอ metric ใกล้เคียง)
 *   3. intent + params (Gemini, enum only) → ไม่มั่นใจ = clarify (ห้ามเดา §3.1 ข้อ 4)
 *   4. validate + run (RPC bind org_id)    → key นอก allowlist = error (ไม่ fallback เงียบ)
 *   5. chart (deterministic) + narrate     → LLM เรียบเรียงเท่านั้น ห้ามผลิตตัวเลข
 *   6. log `bi_query_log` **ทุกกรณี** พร้อม token/cost/latency/sql_ms/answer_status (§5)
 *
 * route handler เรียกฟังก์ชันนี้ตัวเดียว — logic ทั้งหมดอยู่ที่นี่เพื่อให้ LINE (Phase 2)
 * ใช้ซ้ำได้โดยไม่ต้องคัดลอกกฎ
 */

import type { createAdminClient } from "@/app/api/_lib/supabase";
import { buildChartSpec } from "./chart";
import { estimateBiCostUsd, getBiDailyLimit } from "./cost";
import {
  buildDefinitionLine,
  narrateAnswer as defaultNarrateAnswer,
  type NarrateResult,
} from "./answer";
import {
  applyVatBasis,
  detectVatBasis,
  extractIntent as defaultExtractIntent,
  vatBaseKey,
  vatBasisOfKey,
  vatSiblings,
  type BiIntent,
} from "./intent";
import {
  checkIndexHealth as defaultCheckIndexHealth,
  listDraftMetrics as defaultListDraftMetrics,
  listVisibleMetrics as defaultListVisibleMetrics,
  matchByKeyword,
  cosineSimilarity,
  DRAFT_MIN_SIMILARITY,
  suggestMetrics,
} from "./metrics";
import type { BiPeriod } from "./period";
import {
  embedQuestion as defaultEmbedQuestion,
  isAmbiguousMatch,
  matchMetrics as defaultMatchMetrics,
  resolveOrgScopes as defaultResolveOrgScopes,
  DECISIVE_GAP,
  SUGGEST_MIN_SIMILARITY,
  type BiMetricCandidate,
} from "./resolver";
import {
  classifyRunError,
  computeResultShape,
  measureKeys,
  runMetric as defaultRunMetric,
  validateParams,
  VALUE_KEY,
  DIMENSION_KEY,
  type RunMetricResult,
} from "./runner";
import {
  appendMessage,
  createThread,
  getThreadPreferences,
  isThreadOwnedBy,
  lastAssistantTurn,
  setThreadPreferences,
} from "./threads";
import {
  isTimeGrain,
  type AnswerSource,
  type AnswerStatus,
  type BiAnswer,
  type BiClarifyOption,
  type BiMetricParams,
  type BiRole,
} from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export interface AskBiInput {
  /** ต้องมาจากผลของ `requireBiMember` เท่านั้น */
  orgId: string;
  profileId: string;
  role: BiRole;
  question: string;
  threadId?: string | null;
  source?: AnswerSource;
}

export interface AskBiDeps {
  admin: Admin;
  embedQuestion?: typeof defaultEmbedQuestion;
  matchMetrics?: typeof defaultMatchMetrics;
  extractIntent?: typeof defaultExtractIntent;
  runMetric?: typeof defaultRunMetric;
  narrateAnswer?: typeof defaultNarrateAnswer;
  resolveOrgScopes?: typeof defaultResolveOrgScopes;
  listVisibleMetrics?: typeof defaultListVisibleMetrics;
  listDraftMetrics?: typeof defaultListDraftMetrics;
  checkIndexHealth?: typeof defaultCheckIndexHealth;
  /** วันอ้างอิง (เทส) */
  today?: Date;
}

const MAX_QUESTION_LENGTH = 500;

/**
 * `threadId` ที่ client ส่งมาไม่ใช่ของผู้ถาม (หรือไม่มีอยู่)
 * — route ต้องแปลงเป็น **404** ไม่ใช่ 403 (ห้ามยืนยันว่า thread นั้นมีอยู่จริง)
 */
export class BiThreadNotFoundError extends Error {
  constructor() {
    super("bi thread not found or not owned by caller");
    this.name = "BiThreadNotFoundError";
  }
}

export async function askBi(input: AskBiInput, deps: AskBiDeps): Promise<BiAnswer> {
  const t0 = Date.now();
  const admin = deps.admin;
  const source: AnswerSource = input.source ?? "web";
  const question = (input.question ?? "").trim().slice(0, MAX_QUESTION_LENGTH);

  const usage = { tokenIn: 0, tokenOut: 0, embedTokens: 0, model: "" };
  let threadId = input.threadId ?? null;

  /** ปิดงานหนึ่งรอบ: บันทึกข้อความผู้ช่วย + log + คืน payload */
  const finish = async (args: {
    status: AnswerStatus;
    bullets: string[];
    metricKey?: string | null;
    metricLabel?: string | null;
    metricDefinition?: string | null;
    timeBasis?: string | null;
    params?: BiMetricParams;
    chart?: BiAnswer["chart"];
    rows?: Array<Record<string, unknown>>;
    /**
     * false = **ห้ามเก็บ `result_rows` ลง `bi_messages`** (metric `no_summarize`/grain รายการ)
     * — ข้อมูลรายแถว/รายบุคคลไม่ควรค้างใน DB นานกว่าที่จำเป็น · UI ยังได้ rows ใน payload รอบนี้
     */
    persistRows?: boolean;
    /**
     * true = metric `no_summarize` → ตัดค่าที่ผู้ใช้กรอกใน `work.params` ก่อนเก็บลง `answer_meta`
     * (`definition_line` ยังเก็บครบเสมอ — กฎเหล็ก §3.1 ข้อ 5)
     */
    redactWorkParams?: boolean;
    rowCount?: number;
    truncated?: boolean;
    definitionLine?: string;
    followUps?: string[];
    work?: BiAnswer["work"];
    clarify?: BiAnswer["clarify"];
    matchScore?: number | null;
    sqlMs?: number | null;
    errorMessage?: string | null;
  }): Promise<BiAnswer> => {
    const params = args.params ?? {};
    const content = args.bullets.join("\n");
    let messageId = "";

    if (threadId) {
      try {
        const msg = await appendMessage(admin, {
          orgId: input.orgId,
          threadId,
          role: "assistant",
          content,
          metricKey: args.metricKey ?? null,
          params,
          chartSpec: args.chart ?? null,
          resultRows: args.persistRows === false ? null : (args.rows ?? null),
          resultRowCount: args.rowCount ?? null,
          source,
          createdBy: input.profileId,
          // 5 ส่วนของคำตอบ — ต้องเก็บทุกครั้ง ไม่งั้นเปิดประวัติเก่าแล้วบรรทัดนิยามหาย
          answerMeta: {
            definition_line: args.definitionLine ?? "",
            follow_ups: args.followUps ?? [],
            work: args.work ?? null,
            truncated: Boolean(args.truncated),
            answer_status: args.status,
            // ปุ่มตัวเลือกของ clarify ต้องอยู่รอดการรีเฟรช (ไม่งั้นผู้ใช้ต้องพิมพ์คำถามใหม่)
            clarify: args.clarify ?? null,
          },
          redactWorkParams: args.redactWorkParams === true,
        });
        messageId = msg.id;
      } catch (e) {
        console.error("[bi] appendMessage assistant failed:", (e as Error).message);
      }
    }

    const latencyMs = Date.now() - t0;
    const costUsd = estimateBiCostUsd({
      tokenIn: usage.tokenIn,
      tokenOut: usage.tokenOut,
      embedTokens: usage.embedTokens,
    });

    try {
      await admin.from("bi_query_log").insert({
        org_id: input.orgId,
        profile_id: input.profileId,
        thread_id: threadId,
        message_id: messageId || null,
        source,
        question,
        matched_metric_key: args.metricKey ?? null,
        match_score: args.matchScore ?? null,
        params,
        answer_status: args.status,
        result_row_count: args.rowCount ?? null,
        latency_ms: latencyMs,
        sql_ms: args.sqlMs ?? null,
        model: usage.model || null,
        token_in: usage.tokenIn,
        token_out: usage.tokenOut,
        cost_usd: Number(costUsd.toFixed(6)),
        error_message: args.errorMessage ?? null,
      });
    } catch (e) {
      console.error("[bi] bi_query_log insert failed:", (e as Error).message);
    }

    return {
      threadId: threadId ?? "",
      messageId,
      status: args.status,
      answer: { bullets: args.bullets },
      metric: args.metricKey
        ? {
            key: args.metricKey,
            label_th: args.metricLabel ?? "",
            definition_th: args.metricDefinition ?? "",
            time_basis: args.timeBasis ?? null,
          }
        : null,
      params,
      chart: args.chart ?? null,
      rows: args.rows ?? [],
      row_count: args.rowCount ?? 0,
      truncated: Boolean(args.truncated),
      definition_line: args.definitionLine ?? "",
      follow_ups: args.followUps ?? [],
      work: args.work ?? null,
      ...(args.clarify ? { clarify: args.clarify } : {}),
    };
  };

  if (!question) {
    return finish({
      status: "error",
      bullets: ["กรุณาพิมพ์คำถามที่ต้องการทราบ"],
      errorMessage: "empty question",
    });
  }

  // ─ 0) เจ้าของ thread — client ระบุ `threadId` มาเองได้ จึงเชื่อไม่ได้ ─
  // ตาราง `bi_*` อ่าน/เขียนผ่าน service-role → RLS ไม่ช่วย · ตรวจก่อนแตะอะไรทั้งสิ้น
  // (ก่อนนับ rate-limit ด้วย — คำขอที่ไม่ชอบธรรมไม่ควรกินโควตาของเจ้าตัว)
  if (threadId && !(await isThreadOwnedBy(admin, input.orgId, threadId, input.profileId))) {
    throw new BiThreadNotFoundError();
  }

  // ─ 1) rate-limit ต่อคน/วัน (§5) ─
  const dailyLimit = getBiDailyLimit();
  try {
    const { data: allowed, error } = await admin.rpc("incr_bi_usage", {
      p_org_id: input.orgId,
      p_profile_id: input.profileId,
      p_daily_limit: dailyLimit,
    });
    if (error) throw new Error(error.message);
    if (allowed === false) {
      return finish({
        status: "refused",
        bullets: [
          `คุณถามครบเพดานของวันนี้แล้ว (${dailyLimit} คำถาม/คน/วัน) กรุณาลองใหม่พรุ่งนี้ หรือติดต่อผู้ดูแลระบบเพื่อขอเพิ่มเพดาน`,
        ],
        errorMessage: "rate limit exceeded",
      });
    }
  } catch (e) {
    console.error("[bi] incr_bi_usage failed:", (e as Error).message);
  }

  // ─ thread + ข้อความของผู้ใช้ ─
  try {
    if (!threadId) {
      const thread = await createThread(admin, {
        orgId: input.orgId,
        createdBy: input.profileId,
        title: question.slice(0, 80),
      });
      threadId = thread.id;
    }
    await appendMessage(admin, {
      orgId: input.orgId,
      threadId,
      role: "user",
      content: question,
      source,
      createdBy: input.profileId,
    });
  } catch (e) {
    console.error("[bi] thread setup failed:", (e as Error).message);
  }

  const prefs = threadId
    ? await safe(() => getThreadPreferences(admin, input.orgId, threadId!, input.profileId), {})
    : {};
  const previousTurn = threadId
    ? await safe(() => lastAssistantTurn(admin, input.orgId, threadId!, input.profileId), null)
    : null;

  // ─ 2) embed + match (scope ของ org + role ของผู้ถาม) ─
  const scopes = await (deps.resolveOrgScopes ?? defaultResolveOrgScopes)(admin, input.orgId);
  let candidates: BiMetricCandidate[] = [];
  let questionEmbedding: number[] | null = null;
  try {
    const embedded = await (deps.embedQuestion ?? defaultEmbedQuestion)(question);
    usage.embedTokens += embedded.estimatedTokens;
    questionEmbedding = embedded.values;
    candidates = await (deps.matchMetrics ?? defaultMatchMetrics)({
      admin,
      embedding: embedded.values,
      scopes,
      role: input.role,
    });
  } catch (e) {
    return finish({
      status: "error",
      bullets: ["ระบบค้นหาตัวชี้วัดขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง"],
      errorMessage: (e as Error).message,
    });
  }

  if (candidates.length === 0) {
    return finish(
      await buildNoMatch({
        admin,
        deps,
        scopes,
        role: input.role,
        question,
        embedding: questionEmbedding ?? undefined,
      }),
    );
  }

  // ─ 3) intent ─
  let intent: BiIntent;
  try {
    intent = await (deps.extractIntent ?? defaultExtractIntent)(question, candidates, {
      threadPreferences: prefs,
      previousTurn,
    });
  } catch (e) {
    return finish({
      status: "error",
      bullets: ["ระบบตีความคำถามขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง"],
      errorMessage: (e as Error).message,
    });
  }
  usage.tokenIn += intent.usage.tokenIn;
  usage.tokenOut += intent.usage.tokenOut;
  if (intent.usage.model) usage.model = intent.usage.model;

  // คู่ incl/excl VAT คะแนนใกล้กันเป็นธรรมชาติ — ให้ด่าน D1 ข้างล่างจัดการ (ข้อความชัดกว่า)
  const ambiguous =
    isAmbiguousMatch(candidates) &&
    !(
      vatBaseKey(candidates[0].key) &&
      vatBaseKey(candidates[0].key) === vatBaseKey(candidates[1]?.key ?? "")
    );

  /**
   * อันดับ 1 นำขาด + LLM เลือกตัวเดียวกันด้วยความมั่นใจพอ = ตอบเลย ไม่ต้องถามกลับ
   * (คำถามง่าย ๆ ไม่ควรต้องกดเลือกเพิ่ม) · ไม่ข้ามด่าน D1 คู่ VAT ที่อยู่ถัดไป
   */
  const leadGap =
    candidates.length < 2 ? 1 : candidates[0].similarity - (candidates[1]?.similarity ?? 0);
  /**
   * "สองสัญญาณที่เป็นอิสระต่อกันเห็นตรงกัน" = ไม่ต้องถามกลับ
   *
   * retrieval (เวกเตอร์) จัดอันดับ 1 ให้ metric ไหน แล้ว LLM ก็เลือกตัวเดียวกันด้วยความมั่นใจพอ
   * → การถามกลับไม่เพิ่มความแม่น มีแต่เพิ่มขั้นตอน (QA: "มีงานจัดซื้อกี่ใบ" ต้องกดเลือกก่อน
   * ทั้งที่ชัดเจน) · **ไม่ผูกกับ `leadGap` อย่างเดียว** เพราะคำถามธรรมชาติมักได้คะแนนใกล้กัน
   * หลายตัวโดยที่คำตอบที่ถูกยังชัดอยู่ · ด่าน D1 คู่ VAT อยู่ถัดไปและไม่ถูกข้าม
   */
  const decisive =
    Boolean(intent.metric_key) &&
    intent.metric_key === candidates[0].key &&
    (intent.confidence >= 0.6 || leadGap > DECISIVE_GAP);

  if (!intent.metric_key || (!decisive && (intent.needs_clarify || ambiguous))) {
    // เสนอเฉพาะตัวที่ "เกี่ยวข้องจริง" — ผ่าน MIN_SIMILARITY อย่างเดียวยังไม่พอที่จะโชว์
    const relevant = candidates.filter((c) => c.similarity >= SUGGEST_MIN_SIMILARITY).slice(0, 3);

    if (relevant.length === 0) {
      // ไม่มีอะไรใกล้พอให้เลือก = ตอบไม่ได้ ดีกว่าเสนอมั่ว → เข้าเส้นทางเดียวกับ no_match
      return finish(
        await buildNoMatch({
          admin,
          deps,
          scopes,
          role: input.role,
          question,
          embedding: questionEmbedding ?? undefined,
        }),
      );
    }

    const options = toClarifyOptions(relevant);
    return finish({
      status: "clarify",
      bullets: [
        intent.clarify_reason ||
          "คำถามนี้ตีความได้มากกว่าหนึ่งแบบ ขอให้เลือกตัวชี้วัดที่ต้องการก่อนนะครับ",
      ],
      clarify: {
        question: "ต้องการดูตัวชี้วัดไหน?",
        options,
      },
      followUps: options.map((o) => `ขอดู${o.label_th}`),
      matchScore: candidates[0]?.similarity ?? null,
    });
  }

  // ─ D1: ฐานมูลค่า incl/excl VAT — ไม่ระบุและมีทั้งคู่ = ถามกลับ (ห้าม default เงียบ) ─
  let metricKey = intent.metric_key;
  const siblings = vatSiblings(candidates, metricKey);
  if (vatBasisOfKey(metricKey) && siblings.length >= 2) {
    const basis = detectVatBasis(question) ?? intent.params.vat_basis ?? prefs.vat_basis ?? null;
    if (!basis) {
      return finish({
        status: "clarify",
        bullets: ["ตัวเลขมูลค่ามีสองฐาน — ต้องการแบบรวมภาษีมูลค่าเพิ่ม หรือก่อนภาษี?"],
        clarify: { question: "ต้องการมูลค่าฐานไหน?", options: toClarifyOptions(siblings) },
        followUps: siblings.map((s) => `ขอดู${s.label_th}`),
        matchScore: candidates[0]?.similarity ?? null,
      });
    }
    metricKey = applyVatBasis(candidates, metricKey, basis);
    if (threadId)
      await safe(
        () =>
          setThreadPreferences(admin, input.orgId, threadId!, input.profileId, {
            vat_basis: basis,
          }),
        {},
      );
  }

  const metric = candidates.find((c) => c.key === metricKey) ?? candidates[0];

  // ─ 4) validate + run ─
  const validated = validateParams(metric, intent.params, { today: deps.today });
  if (!validated.ok) {
    return finish({
      status: "error",
      bullets: [validated.error],
      metricKey: metric.key,
      metricLabel: metric.label_th,
      metricDefinition: metric.definition_th,
      matchScore: metric.similarity,
      errorMessage: validated.error,
    });
  }

  let run: RunMetricResult;
  try {
    run = await (deps.runMetric ?? defaultRunMetric)({
      admin,
      orgId: input.orgId,
      metricKey: metric.key,
      rpcParams: validated.rpcParams,
      // RPC เป็นด่านสุดท้ายของ RBAC + verified (metric key มาได้จาก thread history/dashboard ด้วย)
      role: input.role,
      allowDraft: false,
    });
  } catch (e) {
    const classified = classifyRunError((e as Error).message);
    return finish({
      status: classified.status,
      bullets: [classified.text],
      metricKey: metric.key,
      metricLabel: metric.label_th,
      metricDefinition: metric.definition_th,
      params: validated.params,
      matchScore: metric.similarity,
      errorMessage: (e as Error).message,
    });
  }

  // metric ที่ยังไม่ verified ตอบไม่ได้ (retrieval กรองแล้ว — นี่คือด่านสอง)
  if (run.metric.status !== "verified") {
    return finish({
      status: "refused",
      bullets: ["ยังไม่มีนิยามที่ยืนยันสำหรับคำถามนี้ จึงยังตอบเป็นตัวเลขให้ไม่ได้"],
      metricKey: metric.key,
      metricLabel: run.metric.label_th || metric.label_th,
      metricDefinition: run.metric.definition_th || metric.definition_th,
      params: validated.params,
      matchScore: metric.similarity,
      sqlMs: run.elapsed_ms,
      errorMessage: `metric status = ${run.metric.status}`,
    });
  }

  // ─ 5) chart (deterministic) + narrate ─
  const shape = computeResultShape({
    rows: run.rows,
    dimension: validated.params.dimension ?? null,
    timeGrain: validated.params.time_grain ?? null,
    metricKey: metric.key,
    chartHint: run.metric.chart_hint,
  });
  const chart = buildChartSpec({
    shape,
    labelTh: run.metric.label_th || metric.label_th,
    unit: run.metric.unit,
    unitDecimals: run.metric.unit_decimals,
    xKey: shape.dimensionCount > 0 ? DIMENSION_KEY : null,
    series: seriesOf(run.rows, run.metric.label_th || metric.label_th),
    chartHint: run.metric.chart_hint,
  });

  let narration: NarrateResult;
  try {
    narration = await (deps.narrateAnswer ?? defaultNarrateAnswer)({
      question,
      metric: run.metric,
      candidate: metric,
      rows: run.rows,
      period: validated.period,
      comparePeriod: validated.comparePeriod,
      isDetailGrain: shape.isDetailGrain,
      truncated: run.truncated,
      notices: validated.notices,
    });
  } catch (e) {
    console.error("[bi] narrateAnswer failed:", (e as Error).message);
    narration = {
      bullets: [`${run.metric.label_th}: ดูตัวเลขจากตารางด้านล่าง`],
      follow_ups: [],
      usage: { tokenIn: 0, tokenOut: 0, model: "" },
      source: "rule",
      fallback_reason: (e as Error).message,
    };
  }
  usage.tokenIn += narration.usage.tokenIn;
  usage.tokenOut += narration.usage.tokenOut;
  if (narration.usage.model) usage.model = narration.usage.model;

  const bullets = [...narration.bullets];
  for (const notice of validated.notices) if (!bullets.includes(notice)) bullets.push(notice);

  return finish({
    status: "answered",
    bullets,
    metricKey: metric.key,
    metricLabel: run.metric.label_th || metric.label_th,
    metricDefinition: run.metric.definition_th || metric.definition_th,
    timeBasis: run.metric.time_basis,
    params: validated.params,
    chart,
    rows: run.rows,
    // ข้อมูลระดับรายการ/บุคคล: ส่งให้ UI รอบนี้ได้ แต่ไม่เก็บค้างใน bi_messages
    persistRows: !(run.metric.no_summarize || shape.isDetailGrain),
    redactWorkParams: run.metric.no_summarize,
    rowCount: run.row_count,
    truncated: run.truncated,
    definitionLine: buildDefinitionLine(run.metric, validated.period, validated.comparePeriod),
    followUps: narration.follow_ups,
    work: {
      sql: run.sql,
      // ค่าที่ RPC ใช้จริง (หลัง clamp ตาม max_period_months) — ไม่ใช่ค่าที่ผู้ใช้ขอ
      params: effectiveParamsToBiParams(run.effective_params, validated.params),
      elapsed_ms: run.elapsed_ms,
      row_count: run.row_count,
    },
    matchScore: metric.similarity,
    sqlMs: run.elapsed_ms,
  });
}

// ─── helpers ───────────────────────────────────────────────────────────────

interface NoMatchArgs {
  admin: Admin;
  deps: AskBiDeps;
  scopes: Awaited<ReturnType<typeof defaultResolveOrgScopes>>;
  role: BiRole;
  question: string;
  /** เวกเตอร์ของคำถาม (มีอยู่แล้วจากขั้น retrieval) — ใช้กรอง draft ด้วยความหมาย */
  embedding?: number[];
}

interface NoMatchResult {
  status: AnswerStatus;
  bullets: string[];
  followUps: string[];
  errorMessage: string | null;
}

/**
 * เส้นทาง "ตอบไม่ได้" — แยกสามกรณีให้ขาดจากกัน (QA blocker 1 & 2)
 *
 *  1. **ระบบยังตั้งค่าไม่เสร็จจริง** = มี metric ที่ยืนยันแล้วแต่ยังไม่มีตัวไหนถูกฝัง embedding
 *     → ต้อง **ตรวจจากฐานข้อมูลจริง** (`checkIndexHealth`) ห้ามเดาจาก "ไม่มี candidate"
 *  2. **มีตัวชี้วัดอยู่แต่ยังเป็นร่าง** (`status='draft'`) → บอกว่ามีอยู่ แต่ยังยืนยันนิยามไม่เสร็จ
 *     จึงยังตอบเป็นตัวเลขไม่ได้ (**ห้ามรัน metric draft**) — ต่างจาก "ธุรกิจไม่มีข้อมูล" (§3.1 ข้อ 4)
 *  3. **นอกขอบเขต** → ปฏิเสธสุภาพ + เสนอเฉพาะตัวชี้วัดที่เกี่ยวข้องจริง (ไม่เกี่ยว = ไม่เสนอ)
 */
async function buildNoMatch(args: NoMatchArgs): Promise<NoMatchResult> {
  const { admin, deps, scopes, role, question } = args;

  const [health, visible, drafts] = await Promise.all([
    // ตรวจไม่ได้ = ถือว่าระบบปกติ (ห้ามเดาว่า "ยังตั้งค่าไม่เสร็จ" แล้วทำผู้ใช้ตกใจ)
    safe(() => (deps.checkIndexHealth ?? defaultCheckIndexHealth)({ admin, scopes, role }), {
      visible: -1,
      embedded: -1,
    }),
    safe(() => (deps.listVisibleMetrics ?? defaultListVisibleMetrics)({ admin, scopes, role }), []),
    safe(() => (deps.listDraftMetrics ?? defaultListDraftMetrics)({ admin, scopes, role }), []),
  ]);

  const suggestions = suggestMetrics(question, visible);
  const followUps = suggestions.map((s) => `ขอดู${s.label_th}`);

  // 1) ยังไม่ได้ฝัง embedding จริง ๆ เท่านั้นถึงจะบอกว่า "ระบบยังตั้งค่าไม่เสร็จ"
  if (health.visible > 0 && health.embedded === 0) {
    return {
      status: "no_match",
      bullets: [
        "ระบบยังตั้งค่าการค้นหาตัวชี้วัดไม่เสร็จ กรุณาแจ้งผู้ดูแลระบบ (ใช้เวลาไม่นาน)",
        `ขณะนี้มีตัวชี้วัดที่ยืนยันแล้ว ${health.visible} รายการ แต่ยังค้นหาด้วยคำถามไม่ได้`,
      ],
      followUps,
      errorMessage: `bi_metrics.embedding ยังว่าง (verified=${health.visible}, embedded=0) — ต้องรัน pnpm bi:embed`,
    };
  }

  // 2) มีตัวชี้วัดเรื่องนี้อยู่ แต่ยังเป็นร่าง → เปิดเผยว่ามีอยู่ (ห้ามรัน)
  //
  // ต้องผ่าน **ทั้งสองด่าน**: ใกล้กันเชิงความหมาย (embedding) **และ** มีคำตรงกัน (keyword)
  // — keyword อย่างเดียวไม่พอ เพราะคำหน้าที่สั้น ๆ ในภาษาไทยหลุดง่าย ("ยัง" ใน "วันนี้เป็น
  // ยังไงบ้าง" ไปตรงกับคำพ้อง "ยังไม่จ่าย" ของคอมมิชชั่นค้างจ่าย — QA รอบ 3)
  // ถ้าไม่มีเวกเตอร์ให้เทียบ (เช่นในเทสที่ inject rows เอง) → ถอยไปใช้ keyword อย่างเดียว
  const keywordDrafts = matchByKeyword(question, drafts, 3);
  const draft = args.embedding
    ? (keywordDrafts
        .map((d) => ({
          d,
          sim: d.embedding ? cosineSimilarity(args.embedding as number[], d.embedding) : null,
        }))
        .filter((x) => x.sim === null || x.sim >= DRAFT_MIN_SIMILARITY)
        .sort((a, b) => (b.sim ?? 0) - (a.sim ?? 0))[0]?.d ?? null)
    : (keywordDrafts[0] ?? null);
  if (draft) {
    return {
      status: "refused",
      bullets: [
        `เรื่องนี้ระบบมีตัวชี้วัดอยู่ (${draft.label_th}) แต่ยังไม่ได้ยืนยันนิยาม จึงยังตอบเป็นตัวเลขให้ไม่ได้`,
        `นิยามที่ร่างไว้: ${draft.definition_th}`,
        "รอเจ้าของธุรกิจยืนยันนิยามนี้ก่อน แล้วระบบจะเปิดให้ถามได้ทันที",
      ],
      followUps,
      errorMessage: `draft metric matched: ${draft.key}`,
    };
  }

  // 3) ไม่มีตัวชี้วัดที่ยืนยันเลยในขอบเขตนี้
  if (health.visible === 0) {
    return {
      status: "no_match",
      bullets: [
        "ยังไม่มีตัวชี้วัดที่ยืนยันแล้วสำหรับคำถามนี้ จึงยังตอบเป็นตัวเลขให้ไม่ได้",
        "ระบบได้บันทึกคำถามนี้ไว้ให้ทีมงานพิจารณาเพิ่มตัวชี้วัดแล้ว",
      ],
      followUps,
      errorMessage: "ไม่มี metric ที่ verified ในขอบเขตของ org/role นี้",
    };
  }

  // 4) นอกขอบเขต — ปฏิเสธสุภาพ (ระบบปกติดี ไม่ใช่ความผิดพลาด)
  return {
    status: "no_match",
    bullets: [
      "คำถามนี้อยู่นอกเรื่องที่ระบบดูแล — ระบบตอบได้เฉพาะข้อมูลธุรกิจของหน่วยงาน (งานจัดซื้อ การเงิน ลูกหนี้ กองทุน ฯลฯ)",
      suggestions.length
        ? `เรื่องที่ใกล้เคียงกับคำถามของคุณ: ${suggestions.map((s) => s.label_th).join(" · ")}`
        : "กดดู “ตัวชี้วัดทั้งหมด” เพื่อดูว่าถามอะไรได้บ้าง",
    ],
    followUps,
    errorMessage: null,
  };
}

/**
 * แปลง `effective_params` ที่ RPC คืนกลับ (ค่าจริงที่ใช้รัน หลัง clamp เพดานช่วงเวลา)
 * → รูป `BiMetricParams` สำหรับ panel "ดูวิธีคำนวณ" (§3.3 ข้อ 5)
 */
export function effectiveParamsToBiParams(
  effective: Record<string, unknown> | null | undefined,
  fallback: BiMetricParams,
): BiMetricParams {
  const e = effective ?? {};
  const from = typeof e.date_from === "string" ? e.date_from : null;
  const to = typeof e.date_to === "string" ? e.date_to : null;
  const grain = fallback.period?.grain ?? "month";

  return {
    ...(from && to
      ? { period: { grain, from, to } }
      : fallback.period
        ? { period: fallback.period }
        : {}),
    ...(typeof e.time_grain === "string" && isTimeGrain(e.time_grain)
      ? { time_grain: e.time_grain }
      : fallback.time_grain
        ? { time_grain: fallback.time_grain }
        : {}),
    ...(typeof e.dimension === "string"
      ? { dimension: e.dimension }
      : fallback.dimension
        ? { dimension: fallback.dimension }
        : {}),
    comparison: fallback.comparison ?? "none",
    ...(e.filters && typeof e.filters === "object" && Object.keys(e.filters as object).length
      ? { filters: e.filters as Record<string, unknown> }
      : fallback.filters
        ? { filters: fallback.filters }
        : {}),
    ...(Number.isFinite(Number(e.limit)) ? { limit: Number(e.limit) } : {}),
  };
}

function toClarifyOptions(candidates: BiMetricCandidate[]): BiClarifyOption[] {
  return candidates.map((c) => ({
    metric_key: c.key,
    label_th: c.label_th,
    definition_th: c.definition_th,
  }));
}

/** measure ที่จะพล็อต — `value` มาก่อนเสมอ ตามสัญญาของ sql_template */
function seriesOf(rows: Array<Record<string, unknown>>, label: string) {
  const keys = measureKeys(rows);
  if (keys.length === 0) return [{ key: VALUE_KEY, label_th: label }];
  const ordered = keys.includes(VALUE_KEY)
    ? [VALUE_KEY, ...keys.filter((k) => k !== VALUE_KEY)]
    : keys;
  return ordered.map((k) => ({ key: k, label_th: k === VALUE_KEY ? label : k }));
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error("[bi] non-fatal:", (e as Error).message);
    return fallback;
  }
}

export type { BiPeriod };
