import crypto from "crypto";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolvePettyCashCategory } from "@/lib/petty-cash/category-match";
import { parsePettyCashLineText } from "@/lib/petty-cash/line-parser";

export const runtime = "nodejs";

function verifyLineSignature(args: { body: string; signature: string | null; channelSecret: string | undefined }) {
  const secret = args.channelSecret ?? "";
  const signature = args.signature ?? "";
  if (!secret || !signature) return false;
  const computed = crypto.createHmac("sha256", secret).update(args.body).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function replyText(args: { replyToken: string; text: string }) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  if (!accessToken) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      replyToken: args.replyToken,
      messages: [{ type: "text", text: args.text }],
    }),
  }).catch(() => null);
}

async function replyMessages(args: { replyToken: string; messages: any[] }) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  if (!accessToken) return;
  const messages = Array.isArray(args.messages) ? args.messages : [];
  if (!messages.length) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      replyToken: args.replyToken,
      messages,
    }),
  }).catch(() => null);
}

function extractLinkTokenFromText(text: string) {
  const t = String(text ?? "").trim();
  const m = t.match(/^link\s*[:：]?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return m?.[1] ?? null;
}

function extractEmployerConnectTokenFromText(text: string) {
  const t = String(text ?? "").trim();
  const m = t.match(/^employer_connect\s*[:：]?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return m?.[1] ?? null;
}

function extractJobDisplayIdFromText(text: string) {
  const t = String(text ?? "").trim().toUpperCase();
  const m = t.match(/^(OR-\d{4}\/\d{5})\/(\d{2})$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function isEmployerWorkersCommand(text: string) {
  const t = String(text ?? "").trim().toLowerCase();
  return t === "/worker" || t === "/workers" || t === "worker" || t === "workers";
}

function isEmployerOrdersCommand(text: string) {
  const t = String(text ?? "").trim().toLowerCase();
  return t === "/order" || t === "/orders" || t === "order" || t === "orders";
}

function getEmployerLookupQuery(text: string) {
  const t = String(text ?? "").trim();
  const m = t.match(/^\/(.+)$/);
  if (!m) return null;

  const q = String(m[1] ?? "").trim();
  if (!q) return null;

  const lower = q.toLowerCase();
  const reserved = ["worker", "workers", "order", "orders", "pc", "help"];
  if (reserved.includes(lower)) return null;
  if (lower.startsWith("pc ")) return null;
  if (lower.startsWith("worker ") || lower.startsWith("workers ")) return null;
  if (lower.startsWith("order ") || lower.startsWith("orders ")) return null;

  return q;
}

function money(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatShortDateTime(input: string | null) {
  if (!input) return "-";
  const d = new Date(input);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "-";
  const date = new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(d);
  return `${date} ${time}`;
}

function createPettyCashBalanceFlexMessage(args: { balance: number }) {
  return {
    type: "flex",
    altText: "ยอดคงเหลือเงินสดย่อย",
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "ยอดคงเหลือเงินสดย่อย", weight: "bold", size: "lg", wrap: true },
          { type: "text", text: `${money(args.balance)} บาท`, weight: "bold", size: "xl", color: "#111827", wrap: true },
        ],
      },
    },
  };
}

function createPettyCashSummaryFlexMessage(args: { balance: number; todayTopUp: number; todaySpend: number; monthTopUp: number; monthSpend: number }) {
  const headerColor = "#F59E0B";
  return {
    type: "flex",
    altText: "สรุปเงินสดย่อย",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        paddingAll: "16px",
        contents: [{ type: "text", text: "สรุปเงินสดย่อย", color: "#111827", weight: "bold", size: "lg", wrap: true }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: "ยอดคงเหลือ", size: "sm", color: "#6B7280", flex: 4 },
                  { type: "text", text: `${money(args.balance)} บาท`, size: "sm", color: "#111827", flex: 6, align: "end", wrap: true },
                ],
              },
              { type: "separator", margin: "md" },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: "วันนี้", size: "sm", color: "#6B7280", flex: 2 },
                  { type: "text", text: `เติม ${money(args.todayTopUp)} • ใช้ ${money(args.todaySpend)}`, size: "sm", color: "#111827", flex: 8, align: "end", wrap: true },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: "เดือนนี้", size: "sm", color: "#6B7280", flex: 2 },
                  { type: "text", text: `เติม ${money(args.monthTopUp)} • ใช้ ${money(args.monthSpend)}`, size: "sm", color: "#111827", flex: 8, align: "end", wrap: true },
                ],
              },
            ],
          },
        ],
      },
    },
  };
}

function createPettyCashTxnSavedFlexMessage(args: { txnType: "TOP_UP" | "SPEND"; amount: number; occurredAt: string | null; categoryName: string | null; balance: number }) {
  const headerColor = args.txnType === "TOP_UP" ? "#10B981" : "#EF4444";
  const verb = args.txnType === "TOP_UP" ? "เติมเงิน" : "ใช้เงิน";
  const cat = args.txnType === "SPEND" ? String(args.categoryName ?? "-") : "-";
  const occurredText = formatShortDateTime(args.occurredAt);
  return {
    type: "flex",
    altText: "บันทึกเงินสดย่อยแล้ว",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        paddingAll: "16px",
        contents: [{ type: "text", text: "บันทึกแล้ว", color: "#FFFFFF", weight: "bold", size: "lg", wrap: true }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: `${verb} ${money(args.amount)} บาท`, size: "md", weight: "bold", color: "#111827", wrap: true },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: "หมวด", size: "sm", color: "#6B7280", flex: 3 },
                  { type: "text", text: cat, size: "sm", color: "#111827", flex: 7, wrap: true },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: "เวลา", size: "sm", color: "#6B7280", flex: 3 },
                  { type: "text", text: occurredText, size: "sm", color: "#111827", flex: 7, wrap: true },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: "ยอดคงเหลือ", size: "sm", color: "#6B7280", flex: 3 },
                  { type: "text", text: `${money(args.balance)} บาท`, size: "sm", color: "#111827", flex: 7, wrap: true },
                ],
              },
            ],
          },
        ],
      },
    },
  };
}

function createPettyCashLastFlexMessage(args: { rows: any[]; balance: number | null }) {
  const headerColor = "#0EA5E9";
  const items = (Array.isArray(args.rows) ? args.rows : []).slice(0, 8).map((r) => {
    const sign = String(r?.txn_type) === "TOP_UP" ? "+" : "-";
    const amountText = `${sign}${money(Number(r?.amount ?? 0))}`;
    const cat = String(r?.category_name ?? "-");
    const title = String(r?.title ?? "").trim() || "-";
    const d = String(r?.occurred_at ?? "");
    return `${d} • ${amountText} • ${cat} • ${title}`;
  });
  const lines = items.length ? items : ["-"];
  return {
    type: "flex",
    altText: "รายการเงินสดย่อยล่าสุด",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        paddingAll: "16px",
        contents: [{ type: "text", text: "รายการเงินสดย่อยล่าสุด", color: "#FFFFFF", weight: "bold", size: "lg", wrap: true }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          ...lines.map((t) => ({ type: "text", text: t, size: "xs", color: "#111827", wrap: true })),
          ...(args.balance == null
            ? []
            : [
                { type: "separator", margin: "md" },
                { type: "text", text: `ยอดคงเหลือ: ${money(args.balance)} บาท`, size: "sm", color: "#111827", weight: "bold", wrap: true },
              ]),
        ],
      },
    },
  };
}

function orderStatusLabel(s: string) {
  if (s === "draft") return "เปิดออเดอร์";
  if (s === "in_progress") return "กำลังดำเนินการ";
  if (s === "billed_first_installment") return "วางบิลงวดแรกแล้ว";
  if (s === "paid_first_installment") return "ชำระงวดแรกแล้ว";
  if (s === "completed") return "ปิดออเดอร์";
  if (s === "pending_approval") return "รออนุมัติ";
  if (s === "approved") return "อนุมัติแล้ว";
  if (s === "rejected") return "ไม่อนุมัติ";
  if (s === "cancelled") return "ยกเลิกออเดอร์";
  return s || "-";
}

async function getActivePettyCashCategories(admin: any) {
  const res = await admin
    .from("petty_cash_categories")
    .select("name,is_active,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(200);
  if (res.error) return [] as string[];
  return (res.data ?? []).map((r: any) => String(r.name)).filter(Boolean);
}

async function getPettyCashBalance(admin: any) {
  const res = await admin.rpc("petty_cash_balance");
  if (res.error) throw new Error(res.error.message);
  return Number(res.data ?? 0);
}

async function getPettyCashSummary(admin: any) {
  const res = await admin.rpc("petty_cash_summary");
  if (res.error) throw new Error(res.error.message);
  const d = (res.data ?? {}) as any;
  return {
    balance: Number(d.balance ?? 0),
    todayTopUp: Number(d.today_top_up ?? 0),
    todaySpend: Number(d.today_spend ?? 0),
    monthTopUp: Number(d.month_top_up ?? 0),
    monthSpend: Number(d.month_spend ?? 0),
  };
}

async function fetchProfileByLineUserId(admin: any, lineUserId: string) {
  const res = await admin.from("profiles").select("id,role,display_name").eq("line_user_id", lineUserId).maybeSingle();
  if (res.error) return null;
  return res.data as any;
}

function isAllowedPettyCashRole(role: string | null) {
  return role === "admin" || role === "operation";
}

function isAllowedServiceJobRole(role: string | null) {
  return role === "admin" || role === "operation";
}

function jobOpsStatusLabel(s: string) {
  if (s === "not_started") return "ยังไม่เริ่ม";
  if (s === "in_progress") return "กำลังดำเนินการ";
  if (s === "done") return "เสร็จสิ้น";
  return s || "-";
}

function createServiceJobFlexMessage(args: {
  jobNo: string;
  serviceName: string;
  customerName: string;
  orderNo: string;
  groupLabel: string;
  workerCount: number;
  opsStatus: string;
  startedAt: string | null;
  completedAt: string | null;
  note: string;
  orderItemId: string;
  allowActions?: boolean;
}) {
  const statusText = jobOpsStatusLabel(args.opsStatus);
  const headerColor = args.opsStatus === "done" ? "#16A34A" : args.opsStatus === "in_progress" ? "#2563EB" : "#6B7280";

  const rows: any[] = [
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "ลูกค้า", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: args.customerName, size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "ออเดอร์", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: args.orderNo, size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "บริการ", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: args.serviceName, size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "กลุ่ม", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: args.groupLabel, size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "แรงงาน", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: `${Math.max(0, Math.trunc(args.workerCount))} คน`, size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "สถานะ", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: statusText, size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
    ...(args.startedAt
      ? [
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "เริ่ม", size: "sm", color: "#6B7280", flex: 3 },
              { type: "text", text: formatShortDateTime(args.startedAt), size: "sm", color: "#111827", flex: 7, wrap: true },
            ],
          },
        ]
      : []),
    ...(args.completedAt
      ? [
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "ปิด", size: "sm", color: "#6B7280", flex: 3 },
              { type: "text", text: formatShortDateTime(args.completedAt), size: "sm", color: "#111827", flex: 7, wrap: true },
            ],
          },
        ]
      : []),
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "หมายเหตุ", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: args.note || "-", size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
  ];

  const allowActions = args.allowActions !== false;
  const footerButtons: any[] = [];
  if (allowActions && args.opsStatus === "not_started") {
    footerButtons.push({
      type: "button",
      style: "primary",
      color: "#2563EB",
      action: { type: "postback", label: "เริ่มดำเนินการ", data: `job_action=start&order_item_id=${encodeURIComponent(args.orderItemId)}` },
    });
  }
  if (allowActions && args.opsStatus === "in_progress") {
    footerButtons.push({
      type: "button",
      style: "primary",
      color: "#DC2626",
      action: { type: "postback", label: "ปิดงาน", data: `job_action=close&order_item_id=${encodeURIComponent(args.orderItemId)}` },
    });
  }

  return {
    type: "flex",
    altText: `Job ${args.jobNo}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        paddingAll: "16px",
        contents: [
          { type: "text", text: "งานบริการ", color: "#FFFFFF", weight: "bold", size: "lg", wrap: true },
          { type: "text", text: args.jobNo, color: "#E5E7EB", size: "sm", wrap: true },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            margin: "sm",
            contents: rows,
          },
        ],
      },
      ...(footerButtons.length
        ? {
            footer: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: footerButtons,
            },
          }
        : {}),
    },
  };
}

function lineConnStatusLabel(s: string) {
  if (s === "CONNECTED") return "เชื่อมแล้ว";
  if (s === "PENDING") return "รอเชื่อม";
  if (s === "ERROR") return "ผิดพลาด";
  return "ยังไม่เชื่อม";
}

function createEmployerDetailBubble(args: {
  displayId: string;
  name: string;
  taxId: string;
  businessType: string;
  address: string;
  branchName: string;
  contactName: string;
  phone: string;
  email: string;
  lineStatus: string;
  connectedAt: string | null;
}) {
  const statusText = lineConnStatusLabel(String(args.lineStatus ?? ""));
  const headerColor = String(args.lineStatus ?? "") === "CONNECTED" ? "#06C755" : "#6B7280";
  const connectedText = args.connectedAt ? formatShortDateTime(args.connectedAt) : "-";

  const rows: any[] = [
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "สถานะ LINE", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: statusText, size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
    ...(String(args.displayId ?? "").trim()
      ? [
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "รหัส", size: "sm", color: "#6B7280", flex: 3 },
              { type: "text", text: String(args.displayId), size: "sm", color: "#111827", flex: 7, wrap: true },
            ],
          },
        ]
      : []),
    ...(args.taxId
      ? [
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "เลขผู้เสียภาษี", size: "sm", color: "#6B7280", flex: 3 },
              { type: "text", text: args.taxId, size: "sm", color: "#111827", flex: 7, wrap: true },
            ],
          },
        ]
      : []),
    ...(args.businessType
      ? [
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "ประเภทธุรกิจ", size: "sm", color: "#6B7280", flex: 3 },
              { type: "text", text: args.businessType, size: "sm", color: "#111827", flex: 7, wrap: true },
            ],
          },
        ]
      : []),
    ...(args.address
      ? [
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "ที่อยู่", size: "sm", color: "#6B7280", flex: 3 },
              { type: "text", text: args.address, size: "sm", color: "#111827", flex: 7, wrap: true },
            ],
          },
        ]
      : []),
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "สาขา", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: args.branchName || "สำนักงานใหญ่", size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
    { type: "separator", margin: "md" },
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "ผู้ติดต่อ", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: args.contactName || "-", size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "โทร", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: args.phone || "-", size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "อีเมล", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: args.email || "-", size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
    ...(String(args.lineStatus ?? "") === "CONNECTED"
      ? [
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "เชื่อมเมื่อ", size: "sm", color: "#6B7280", flex: 3 },
              { type: "text", text: connectedText, size: "sm", color: "#111827", flex: 7, wrap: true },
            ],
          },
        ]
      : []),
  ];

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: headerColor,
      paddingAll: "16px",
      contents: [
        { type: "text", text: "นายจ้าง", color: "#FFFFFF", weight: "bold", size: "lg", wrap: true },
        { type: "text", text: args.name || "-", color: "#E5E7EB", size: "sm", wrap: true },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: rows,
    },
  };
}

function formatCategoryConfirmMessage(args: { input: string; suggestions: string[]; allowedAll?: string[] | null }) {
  const lines: string[] = [];
  lines.push(`ไม่พบหมวด “${args.input}”`);
  if (args.suggestions.length) {
    lines.push("เลือกหมวดที่ถูกต้อง (ตอบเป็นเลข):");
    args.suggestions.forEach((n, idx) => {
      lines.push(`${idx + 1}) ${n}`);
    });
  } else {
    const all = Array.isArray(args.allowedAll) ? args.allowedAll.map((x) => String(x)).filter(Boolean) : [];
    if (all.length) {
      const shown = all.slice(0, 12);
      const suffix = all.length > shown.length ? "..." : "";
      lines.push(`หมวดที่ตั้งค่าไว้: ${shown.join(", ")}${suffix}`);
    }
  }
  lines.push("พิมพ์ “ยืนยัน” เพื่อบันทึกเป็น “อื่นๆ” หรือพิมพ์ “ยกเลิก” เพื่อยกเลิกรายการ");
  return lines.join("\n");
}

async function getPending(admin: any, lineUserId: string) {
  const now = new Date().toISOString();
  const res = await admin
    .from("petty_cash_line_pending")
    .select("id,kind,status,payload,expires_at")
    .eq("line_user_id", lineUserId)
    .eq("status", "pending")
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) return null;
  return res.data as any;
}

async function markPending(admin: any, id: string, status: "used" | "cancelled" | "expired") {
  const now = new Date().toISOString();
  await admin.from("petty_cash_line_pending").update({ status, used_at: now }).eq("id", id);
}

async function createPending(admin: any, args: { lineUserId: string; payload: any }) {
  await admin.from("petty_cash_line_pending").update({ status: "expired", used_at: new Date().toISOString() }).eq("line_user_id", args.lineUserId).eq("status", "pending");
  const ins = await admin.from("petty_cash_line_pending").insert({ line_user_id: args.lineUserId, kind: "CATEGORY_CONFIRM", payload: args.payload });
  if (ins.error) throw new Error(ins.error.message);
}

async function insertPettyCashTxn(admin: any, args: { profileId: string; lineUserId: string; txnType: "TOP_UP" | "SPEND"; amount: number; occurredAt: string; categoryName: string | null; title: string; referenceUrl: string | null; rawText: string }) {
  const categoryName = args.txnType === "SPEND" ? String(args.categoryName ?? "").trim() || "อื่นๆ" : String(args.categoryName ?? "").trim() || null;
  const title = String(args.title ?? "").trim();
  const ins = await admin
    .from("petty_cash_transactions")
    .insert({
      txn_type: args.txnType,
      amount: args.amount,
      occurred_at: args.occurredAt,
      category_name: categoryName,
      title,
      note: null,
      reference_url: args.referenceUrl,
      created_by_profile_id: args.profileId,
      source: "line",
      line_user_id: args.lineUserId,
      raw_text: args.rawText,
    })
    .select("id")
    .single();
  if (ins.error) throw new Error(ins.error.message);
  return ins.data as any;
}

function formatShortDate(input: string | null) {
  if (!input) return "-";
  const d = new Date(input);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

function createWorkerBubble(worker: any) {
  const fullName = String(worker?.full_name ?? "").trim() || "แรงงาน";
  const workerId = String(worker?.worker_id ?? "").trim();
  const nationality = String(worker?.nationality ?? "").trim();
  const passportNo = String(worker?.passport_no ?? "").trim();
  const sex = String(worker?.os_sex ?? "").trim();
  const wpNumber = String(worker?.wp_number ?? "").trim();
  const wpExpire = worker?.wp_expire_date ? formatShortDate(String(worker.wp_expire_date)) : "-";
  const profilePicUrl = String(worker?.profile_pic_url ?? "").trim();

  const hero = profilePicUrl
    ? {
        type: "image",
        url: profilePicUrl,
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
      }
    : undefined;

  const sub = [workerId, nationality, sex].filter((x) => !!x).join(" • ");

  return {
    type: "bubble",
    hero,
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "text", text: fullName, weight: "bold", size: "md", wrap: true },
        sub ? { type: "text", text: sub, size: "xs", color: "#6B7280", wrap: true } : { type: "text", text: "-", size: "xs", color: "#6B7280" },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          margin: "md",
          contents: [
            passportNo
              ? {
                  type: "box",
                  layout: "baseline",
                  contents: [
                    { type: "text", text: "Passport", size: "sm", color: "#6B7280", flex: 3 },
                    { type: "text", text: passportNo, size: "sm", color: "#111827", flex: 7, wrap: true },
                  ],
                }
              : null,
            wpNumber
              ? {
                  type: "box",
                  layout: "baseline",
                  contents: [
                    { type: "text", text: "WP", size: "sm", color: "#6B7280", flex: 3 },
                    { type: "text", text: wpNumber, size: "sm", color: "#111827", flex: 7, wrap: true },
                  ],
                }
              : null,
            {
              type: "box",
              layout: "baseline",
              contents: [
                { type: "text", text: "หมดอายุ WP", size: "sm", color: "#6B7280", flex: 3 },
                { type: "text", text: wpExpire, size: "sm", color: "#111827", flex: 7, wrap: true },
              ],
            },
          ].filter(Boolean),
        },
      ],
    },
  };
}

function createWorkersSummaryBubble(workers: any[]) {
  const total = Array.isArray(workers) ? workers.length : 0;
  const counts = new Map<string, number>();
  for (const w of Array.isArray(workers) ? workers : []) {
    const key = String(w?.nationality ?? "").trim() || "ไม่ระบุ";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.name.localeCompare(b.name, "th")));

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "text", text: "สรุปแรงงานตามสัญชาติ", weight: "bold", size: "md", wrap: true },
        { type: "text", text: `ทั้งหมด ${total} คน`, size: "xs", color: "#6B7280" },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          margin: "md",
          contents: rows.length
            ? rows.map((r) => ({
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: r.name, size: "sm", color: "#111827", flex: 7, wrap: true },
                  { type: "text", text: `${r.count} คน`, size: "sm", color: "#111827", flex: 3, align: "end" },
                ],
              }))
            : [{ type: "text", text: "-", size: "sm", color: "#6B7280" }],
        },
      ],
    },
  };
}

function createOrderBubble(order: any) {
  const displayId = String(order?.display_id ?? "").trim() || "-";
  const statusRaw = String(order?.status ?? "").trim();
  const statusText = orderStatusLabel(statusRaw);
  const total = Number(order?.total ?? 0);
  const remaining = Number(order?.remaining_amount ?? 0);
  const createdAt = order?.created_at ? formatShortDate(String(order.created_at)) : "-";

  const totalText = `${money(Number.isFinite(total) ? total : 0)} บาท`;
  const remainingText = `${money(Number.isFinite(remaining) ? remaining : 0)} บาท`;

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#059669",
      paddingAll: "14px",
      contents: [
        { type: "text", text: `ออเดอร์ ${displayId}`, color: "#FFFFFF", weight: "bold", size: "md", wrap: true },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            {
              type: "box",
              layout: "baseline",
              contents: [
                { type: "text", text: "สถานะ", size: "sm", color: "#6B7280", flex: 3 },
                { type: "text", text: statusText, size: "sm", color: "#111827", flex: 7, wrap: true },
              ],
            },
            {
              type: "box",
              layout: "baseline",
              contents: [
                { type: "text", text: "ยอดรวม", size: "sm", color: "#6B7280", flex: 3 },
                { type: "text", text: totalText, size: "sm", color: "#111827", flex: 7, wrap: true },
              ],
            },
            {
              type: "box",
              layout: "baseline",
              contents: [
                { type: "text", text: "ค้างชำระ", size: "sm", color: "#6B7280", flex: 3 },
                { type: "text", text: remainingText, size: "sm", color: "#111827", flex: 7, wrap: true },
              ],
            },
            {
              type: "box",
              layout: "baseline",
              contents: [
                { type: "text", text: "วันที่", size: "sm", color: "#6B7280", flex: 3 },
                { type: "text", text: createdAt, size: "sm", color: "#111827", flex: 7, wrap: true },
              ],
            },
          ],
        },
      ],
    },
  };
}

function createOrdersSummaryBubble(args: { orders: any[]; limit: number }) {
  const orders = Array.isArray(args.orders) ? args.orders : [];
  const total = orders.length;
  const sumRemaining = orders.reduce((sum, o) => sum + (Number.isFinite(Number(o?.remaining_amount ?? 0)) ? Number(o.remaining_amount) : 0), 0);
  const byStatus = new Map<string, number>();
  for (const o of orders) {
    const s = orderStatusLabel(String(o?.status ?? "").trim());
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
  }
  const statusRows = Array.from(byStatus.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.name.localeCompare(b.name, "th")));

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "text", text: "สรุปออเดอร์", weight: "bold", size: "md", wrap: true },
        { type: "text", text: `แสดงล่าสุด ${Math.min(total, args.limit)} รายการ`, size: "xs", color: "#6B7280" },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          margin: "md",
          contents: [
            {
              type: "box",
              layout: "baseline",
              contents: [
                { type: "text", text: "ยอดค้างรวม", size: "sm", color: "#6B7280", flex: 6 },
                { type: "text", text: `${money(sumRemaining)} บาท`, size: "sm", color: "#111827", flex: 4, align: "end" },
              ],
            },
            { type: "separator", margin: "md" },
            ...statusRows.map((r) => ({
              type: "box",
              layout: "baseline",
              contents: [
                { type: "text", text: r.name, size: "sm", color: "#111827", flex: 7, wrap: true },
                { type: "text", text: `${r.count}`, size: "sm", color: "#111827", flex: 3, align: "end" },
              ],
            })),
          ],
        },
      ],
    },
  };
}

export async function POST(req: Request) {
  const signature = req.headers.get("x-line-signature");
  const body = await req.text();

  const ok = verifyLineSignature({ body, signature, channelSecret: process.env.LINE_CHANNEL_SECRET });
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const payload = JSON.parse(body) as any;
  const events = Array.isArray(payload?.events) ? payload.events : [];
  if (!events.length) return NextResponse.json({ ok: true });

  const admin = createSupabaseAdminClient();

  for (const ev of events) {
    const replyToken = String(ev?.replyToken ?? "");
    const lineUserId = String(ev?.source?.userId ?? "");
    if (!replyToken || !lineUserId) continue;

    if (ev?.type === "postback") {
      const data = String(ev?.postback?.data ?? "");
      const m = data.match(/(?:^|&)job_action=(start|close)(?:&|$)/i);
      const mId = data.match(/(?:^|&)order_item_id=([^&]+)(?:&|$)/i);
      const action = m?.[1]?.toLowerCase() ?? "";
      const orderItemId = mId?.[1] ? decodeURIComponent(mId[1]) : "";
      if (!action || !orderItemId) {
        await replyText({ replyToken, text: "คำสั่งไม่ถูกต้อง" });
        continue;
      }

      const profile = await fetchProfileByLineUserId(admin, lineUserId);
      const role = String(profile?.role ?? "");
      const profileId = String(profile?.id ?? "");
      if (!profileId) {
        await replyText({ replyToken, text: "ยังไม่เชื่อมบัญชี กรุณาเชื่อม LINE จากหน้า ตั้งค่าผู้ใช้" });
        continue;
      }
      if (!isAllowedServiceJobRole(role)) {
        await replyText({ replyToken, text: "ไม่มีสิทธิ์จัดการงานบริการ (อนุญาตเฉพาะ admin/operation)" });
        continue;
      }

      const now = new Date().toISOString();
      const jobRes = await admin
        .from("order_items")
        .select("id,order_id,job_display_id,ops_status,ops_started_at,ops_completed_at,ops_note,orders(display_id,customers(name)),services(name,service_group_code)")
        .eq("id", orderItemId)
        .maybeSingle();
      if (jobRes.error || !jobRes.data) {
        await replyText({ replyToken, text: "ไม่พบงานบริการ" });
        continue;
      }

      const current = jobRes.data as any;
      const currentStatus = String(current.ops_status ?? "");
      const patch: any = { ops_updated_at: now, ops_updated_by_profile_id: profileId };
      if (action === "start") {
        if (currentStatus === "done") {
          await replyText({ replyToken, text: "งานนี้ถูกปิดแล้ว" });
          continue;
        }
        patch.ops_status = "in_progress";
        if (!current.ops_started_at) patch.ops_started_at = now;
        patch.ops_completed_at = null;
      }
      if (action === "close") {
        patch.ops_status = "done";
        if (!current.ops_started_at) patch.ops_started_at = now;
        patch.ops_completed_at = now;
      }

      const updRes = await admin.from("order_items").update(patch).eq("id", orderItemId);
      if (updRes.error) {
        await replyText({ replyToken, text: updRes.error.message });
        continue;
      }

      const afterRes = await admin
        .from("order_items")
        .select("id,order_id,job_display_id,ops_status,ops_started_at,ops_completed_at,ops_note,orders(display_id,customers(name)),services(name,service_group_code)")
        .eq("id", orderItemId)
        .maybeSingle();
      const d = (afterRes.data ?? current) as any;

      const wcRes = await admin
        .from("order_item_workers")
        .select("id", { count: "exact", head: true })
        .eq("order_item_id", orderItemId);
      const workerCount = Number(wcRes.count ?? 0);

      const orderRel = Array.isArray(d.orders) ? d.orders[0] : d.orders;
      const serviceRel = Array.isArray(d.services) ? d.services[0] : d.services;
      const orderNo = String(orderRel?.display_id ?? "-") || "-";
      const customerName = Array.isArray(orderRel?.customers) ? String(orderRel.customers[0]?.name ?? "-") : String(orderRel?.customers?.name ?? "-") || "-";
      const serviceName = String(serviceRel?.name ?? "-") || "-";
      const groupLabel = String(serviceRel?.service_group_code ?? "") === "mou" ? "MOU" : "General";

      const flex = createServiceJobFlexMessage({
        jobNo: String(d.job_display_id ?? "-") || "-",
        serviceName,
        customerName,
        orderNo,
        groupLabel,
        workerCount,
        opsStatus: String(d.ops_status ?? ""),
        startedAt: d.ops_started_at ? String(d.ops_started_at) : null,
        completedAt: d.ops_completed_at ? String(d.ops_completed_at) : null,
        note: String(d.ops_note ?? "").trim(),
        orderItemId: String(d.id ?? orderItemId),
      });
      await replyMessages({ replyToken, messages: [flex] });
      continue;
    }

    if (ev?.type !== "message") continue;
    if (ev?.message?.type !== "text") continue;

    const text = String(ev?.message?.text ?? "");

    const employerConnectToken = extractEmployerConnectTokenFromText(text);
    if (employerConnectToken) {
      const tokenRow = await admin
        .from("customer_line_connect_tokens")
        .select("token,customer_id,expires_at,used_at")
        .eq("token", employerConnectToken)
        .maybeSingle();

      if (tokenRow.error || !tokenRow.data) {
        await replyText({ replyToken, text: "โค้ดเชื่อมต่อไม่ถูกต้อง กรุณาติดต่อทีมงานเพื่อขอลิงก์ใหม่" });
        continue;
      }

      const expiresAt = new Date(String((tokenRow.data as any).expires_at));
      const usedAt = (tokenRow.data as any).used_at;
      if (usedAt) {
        await replyText({ replyToken, text: "โค้ดนี้ถูกใช้งานแล้ว กรุณาติดต่อทีมงานเพื่อขอลิงก์ใหม่" });
        continue;
      }
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
        await replyText({ replyToken, text: "โค้ดหมดอายุ กรุณาติดต่อทีมงานเพื่อขอลิงก์ใหม่" });
        continue;
      }

      const customerId = String((tokenRow.data as any).customer_id ?? "").trim();
      if (!customerId) {
        await replyText({ replyToken, text: "โค้ดไม่สมบูรณ์ กรุณาติดต่อทีมงาน" });
        continue;
      }

      const now = new Date().toISOString();
      await admin
        .from("customer_line_connections")
        .upsert(
          {
            customer_id: customerId,
            line_user_id: lineUserId,
            status: "CONNECTED",
            connected_at: now,
            last_error_at: null,
            last_error_message: null,
            updated_at: now,
          },
          { onConflict: "customer_id" },
        );

      await admin.from("customer_line_connect_tokens").update({ used_at: now }).eq("token", employerConnectToken);

      const custRes = await admin.from("customers").select("name").eq("id", customerId).maybeSingle();
      const name = String((custRes.data as any)?.name ?? "").trim() || "นายจ้าง";
      await replyText({ replyToken, text: `ผลการเชื่อมต่อ\nเชื่อมต่อสำเร็จ: ${name}` });
      continue;
    }

    const employerLookup = getEmployerLookupQuery(text);
    if (employerLookup) {
      const profile = await fetchProfileByLineUserId(admin, lineUserId);
      const role = String(profile?.role ?? "");
      const profileId = String(profile?.id ?? "").trim();
      if (!profileId) {
        await replyText({ replyToken, text: "ยังไม่เชื่อมบัญชี กรุณาเชื่อม LINE จากหน้า ตั้งค่าผู้ใช้" });
        continue;
      }
      if (!(role === "admin" || role === "sale" || role === "operation")) {
        await replyText({ replyToken, text: "ไม่มีสิทธิ์ดูข้อมูลนายจ้าง" });
        continue;
      }

      const q = employerLookup.replaceAll("%", "").replaceAll(",", " ").trim();
      if (q.length < 2) {
        await replyText({ replyToken, text: "กรุณาพิมพ์ / ตามด้วยชื่อนายจ้างอย่างน้อย 2 ตัวอักษร" });
        continue;
      }

      const like = `%${q}%`;
      const custRes = await admin
        .from("customers")
        .select("id,display_id,name,tax_id,business_type,address,branch_name,contact_name,phone,email,updated_at")
        .ilike("name", like)
        .order("updated_at", { ascending: false })
        .limit(5);
      if (custRes.error) {
        await replyText({ replyToken, text: custRes.error.message });
        continue;
      }
      const customers = (custRes.data ?? []) as any[];
      if (!customers.length) {
        await replyText({ replyToken, text: "ไม่พบนายจ้าง" });
        continue;
      }

      const ids = customers.map((c) => String(c.id ?? "")).filter(Boolean);
      const connRes = await admin
        .from("customer_line_connections")
        .select("customer_id,status,connected_at")
        .in("customer_id", ids)
        .limit(2000);
      const connById = new Map<string, any>();
      for (const r of (connRes.data ?? []) as any[]) {
        connById.set(String(r.customer_id), r);
      }

      const bubbles = customers.map((c) => {
        const id = String(c.id ?? "");
        const conn = connById.get(id);
        return createEmployerDetailBubble({
          displayId: String(c.display_id ?? "").trim(),
          name: String(c.name ?? "").trim(),
          taxId: String(c.tax_id ?? "").trim(),
          businessType: String(c.business_type ?? "").trim(),
          address: String(c.address ?? "").trim(),
          branchName: String(c.branch_name ?? "").trim(),
          contactName: String(c.contact_name ?? "").trim(),
          phone: String(c.phone ?? "").trim(),
          email: String(c.email ?? "").trim(),
          lineStatus: String(conn?.status ?? "NOT_CONNECTED"),
          connectedAt: conn?.connected_at ? String(conn.connected_at) : null,
        });
      });

      if (bubbles.length === 1) {
        await replyMessages({ replyToken, messages: [{ type: "flex", altText: "ข้อมูลนายจ้าง", contents: bubbles[0] }] });
        continue;
      }

      await replyMessages({
        replyToken,
        messages: [
          {
            type: "flex",
            altText: "ผลการค้นหานายจ้าง",
            contents: { type: "carousel", contents: bubbles.slice(0, 10) },
          },
        ],
      });
      continue;
    }

    const jobDisplayId = extractJobDisplayIdFromText(text);
    if (jobDisplayId) {
      const profile = await fetchProfileByLineUserId(admin, lineUserId);
      const role = String(profile?.role ?? "");
      const profileId = String(profile?.id ?? "").trim();

      if (profileId) {
        if (!isAllowedServiceJobRole(role)) {
          await replyText({ replyToken, text: "ไม่มีสิทธิ์ดูงานบริการ (อนุญาตเฉพาะ admin/operation)" });
          continue;
        }

        const jobRes = await admin
          .from("order_items")
          .select("id,order_id,job_display_id,ops_status,ops_started_at,ops_completed_at,ops_note,orders(display_id,customers(name)),services(name,service_group_code)")
          .eq("job_display_id", jobDisplayId)
          .maybeSingle();
        if (jobRes.error || !jobRes.data) {
          await replyText({ replyToken, text: "ไม่พบงานบริการ" });
          continue;
        }

        const d = jobRes.data as any;
        const orderItemId = String(d.id ?? "");
        const wcRes = await admin
          .from("order_item_workers")
          .select("id", { count: "exact", head: true })
          .eq("order_item_id", orderItemId);
        const workerCount = Number(wcRes.count ?? 0);

        const orderRel = Array.isArray(d.orders) ? d.orders[0] : d.orders;
        const serviceRel = Array.isArray(d.services) ? d.services[0] : d.services;
        const orderNo = String(orderRel?.display_id ?? "-") || "-";
        const customerName = Array.isArray(orderRel?.customers) ? String(orderRel.customers[0]?.name ?? "-") : String(orderRel?.customers?.name ?? "-") || "-";
        const serviceName = String(serviceRel?.name ?? "-") || "-";
        const groupLabel = String(serviceRel?.service_group_code ?? "") === "mou" ? "MOU" : "General";

        const flex = createServiceJobFlexMessage({
          jobNo: String(d.job_display_id ?? jobDisplayId) || jobDisplayId,
          serviceName,
          customerName,
          orderNo,
          groupLabel,
          workerCount,
          opsStatus: String(d.ops_status ?? ""),
          startedAt: d.ops_started_at ? String(d.ops_started_at) : null,
          completedAt: d.ops_completed_at ? String(d.ops_completed_at) : null,
          note: String(d.ops_note ?? "").trim(),
          orderItemId,
        });
        await replyMessages({ replyToken, messages: [flex] });
        continue;
      }

      const connRes = await admin
        .from("customer_line_connections")
        .select("customer_id,status,updated_at")
        .eq("line_user_id", lineUserId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const conn = connRes.data as any;
      if (connRes.error || !conn?.customer_id || String(conn?.status ?? "") !== "CONNECTED") {
        await replyText({ replyToken, text: "ยังไม่ได้เชื่อมต่อกับนายจ้าง กรุณาติดต่อทีมงานเพื่อขอลิงก์เชื่อมต่อ" });
        continue;
      }

      const customerId = String(conn.customer_id);
      const jobRes = await admin
        .from("order_items")
        .select("id,order_id,job_display_id,ops_status,ops_started_at,ops_completed_at,ops_note,orders(display_id,customer_id,customers(name)),services(name,service_group_code)")
        .eq("job_display_id", jobDisplayId)
        .maybeSingle();
      if (jobRes.error || !jobRes.data) {
        await replyText({ replyToken, text: "ไม่พบงานบริการของบริษัทนี้" });
        continue;
      }

      const d = jobRes.data as any;
      const orderRel = Array.isArray(d.orders) ? d.orders[0] : d.orders;
      const orderCustomerId = String(orderRel?.customer_id ?? "").trim();
      if (!orderCustomerId || orderCustomerId !== customerId) {
        await replyText({ replyToken, text: "ไม่พบงานบริการของบริษัทนี้" });
        continue;
      }

      const orderItemId = String(d.id ?? "");
      const wcRes = await admin
        .from("order_item_workers")
        .select("id", { count: "exact", head: true })
        .eq("order_item_id", orderItemId);
      const workerCount = Number(wcRes.count ?? 0);

      const serviceRel = Array.isArray(d.services) ? d.services[0] : d.services;
      const orderNo = String(orderRel?.display_id ?? "-") || "-";
      const customerName = Array.isArray(orderRel?.customers) ? String(orderRel.customers[0]?.name ?? "-") : String(orderRel?.customers?.name ?? "-") || "-";
      const serviceName = String(serviceRel?.name ?? "-") || "-";
      const groupLabel = String(serviceRel?.service_group_code ?? "") === "mou" ? "MOU" : "General";

      const flex = createServiceJobFlexMessage({
        jobNo: String(d.job_display_id ?? jobDisplayId) || jobDisplayId,
        serviceName,
        customerName,
        orderNo,
        groupLabel,
        workerCount,
        opsStatus: String(d.ops_status ?? ""),
        startedAt: d.ops_started_at ? String(d.ops_started_at) : null,
        completedAt: d.ops_completed_at ? String(d.ops_completed_at) : null,
        note: String(d.ops_note ?? "").trim(),
        orderItemId,
        allowActions: false,
      });
      await replyMessages({ replyToken, messages: [flex] });
      continue;
    }

    if (isEmployerWorkersCommand(text)) {
      const connRes = await admin
        .from("customer_line_connections")
        .select("customer_id,status,updated_at")
        .eq("line_user_id", lineUserId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const conn = connRes.data as any;
      if (connRes.error || !conn?.customer_id || String(conn?.status ?? "") !== "CONNECTED") {
        await replyText({ replyToken, text: "ยังไม่ได้เชื่อมต่อกับนายจ้าง กรุณาติดต่อทีมงานเพื่อขอลิงก์เชื่อมต่อ" });
        continue;
      }

      const customerId = String(conn.customer_id);
      const workersRes = await admin
        .from("workers")
        .select("id,worker_id,full_name,nationality,passport_no,os_sex,profile_pic_url,wp_number,wp_expire_date,created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(9);
      if (workersRes.error) {
        await replyText({ replyToken, text: workersRes.error.message });
        continue;
      }

      const workers = (workersRes.data ?? []) as any[];
      if (!workers.length) {
        await replyText({ replyToken, text: "ยังไม่พบแรงงานของบริษัทนี้ในระบบ" });
        continue;
      }

      const summaryBubble = createWorkersSummaryBubble(workers);
      const bubbles = [summaryBubble, ...workers.map((w) => createWorkerBubble(w))];
      const flex = {
        type: "flex",
        altText: "รายการแรงงาน",
        contents: {
          type: "carousel",
          contents: bubbles,
        },
      };
      await replyMessages({ replyToken, messages: [flex] });
      continue;
    }

    if (isEmployerOrdersCommand(text)) {
      const connRes = await admin
        .from("customer_line_connections")
        .select("customer_id,status,updated_at")
        .eq("line_user_id", lineUserId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const conn = connRes.data as any;
      if (connRes.error || !conn?.customer_id || String(conn?.status ?? "") !== "CONNECTED") {
        await replyText({ replyToken, text: "ยังไม่ได้เชื่อมต่อกับนายจ้าง กรุณาติดต่อทีมงานเพื่อขอลิงก์เชื่อมต่อ" });
        continue;
      }

      const customerId = String(conn.customer_id);
      const limit = 9;
      const ordersRes = await admin
        .from("orders")
        .select("id,display_id,status,total,remaining_amount,created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (ordersRes.error) {
        await replyText({ replyToken, text: ordersRes.error.message });
        continue;
      }

      const orders = (ordersRes.data ?? []) as any[];
      if (!orders.length) {
        await replyText({ replyToken, text: "ยังไม่พบออเดอร์ของบริษัทนี้ในระบบ" });
        continue;
      }

      const summary = createOrdersSummaryBubble({ orders, limit });
      const bubbles = [summary, ...orders.map((o) => createOrderBubble(o))].slice(0, 10);
      const flex = {
        type: "flex",
        altText: "รายการออเดอร์",
        contents: {
          type: "carousel",
          contents: bubbles,
        },
      };
      await replyMessages({ replyToken, messages: [flex] });
      continue;
    }

    const linkToken = extractLinkTokenFromText(text);
    if (!linkToken) {
      const cmd = parsePettyCashLineText(text);
      if (!cmd) continue;

      const profile = await fetchProfileByLineUserId(admin, lineUserId);
      const role = String(profile?.role ?? "");
      const profileId = String(profile?.id ?? "");
      if (!profileId) {
        await replyText({ replyToken, text: "ยังไม่เชื่อมบัญชี กรุณาเชื่อม LINE จากหน้า ตั้งค่าผู้ใช้" });
        continue;
      }
      if (!isAllowedPettyCashRole(role)) {
        await replyText({ replyToken, text: "ไม่มีสิทธิ์บันทึกเงินสดย่อย (อนุญาตเฉพาะ admin/operation)" });
        continue;
      }

      const pending = await getPending(admin, lineUserId);
      const msg = String(text ?? "").trim();

      if (pending) {
        const lower = msg.toLowerCase();
        const isCancel = lower === "ยกเลิก" || lower === "cancel";
        const isConfirm = lower === "ยืนยัน" || lower === "confirm";
        const pickNumber = msg.match(/^\d{1,2}$/) ? Number(msg) : NaN;
        const payload = (pending as any).payload ?? {};
        const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions.map((x: any) => String(x)) : [];
        const txn = payload?.txn;

        if (isCancel) {
          await markPending(admin, String(pending.id), "cancelled");
          await replyText({ replyToken, text: "ยกเลิกรายการที่รอยืนยันแล้ว" });
          continue;
        }

        if (isConfirm || (Number.isFinite(pickNumber) && pickNumber >= 1 && pickNumber <= suggestions.length)) {
          const categoryName = isConfirm ? "อื่นๆ" : String(suggestions[pickNumber - 1] ?? "อื่นๆ");
          try {
            await insertPettyCashTxn(admin, {
              profileId,
              lineUserId,
              txnType: String(txn?.txnType) === "TOP_UP" ? "TOP_UP" : "SPEND",
              amount: Number(txn?.amount ?? 0),
              occurredAt: String(txn?.occurredAt ?? ""),
              categoryName,
              title: String(txn?.title ?? "").trim(),
              referenceUrl: txn?.referenceUrl ? String(txn.referenceUrl) : null,
              rawText: String(txn?.rawText ?? ""),
            });
            await markPending(admin, String(pending.id), "used");
            const bal = await getPettyCashBalance(admin);
            const flex = createPettyCashTxnSavedFlexMessage({
              txnType: String(txn?.txnType) === "TOP_UP" ? "TOP_UP" : "SPEND",
              amount: Number(txn?.amount ?? 0),
              occurredAt: txn?.occurredAt ? String(txn.occurredAt) : null,
              categoryName,
              balance: bal,
            });
            await replyMessages({ replyToken, messages: [flex] });
          } catch (e: any) {
            await replyText({ replyToken, text: e?.message ?? "บันทึกไม่สำเร็จ" });
          }
          continue;
        }

        await replyText({
          replyToken,
          text: formatCategoryConfirmMessage({
            input: String(payload?.categoryInput ?? "").trim() || "(ไม่ระบุ)",
            suggestions,
            allowedAll: Array.isArray(payload?.allowedAll) ? payload.allowedAll : null,
          }),
        });
        continue;
      }

      if (cmd.kind === "balance") {
        try {
          const bal = await getPettyCashBalance(admin);
          const flex = createPettyCashBalanceFlexMessage({ balance: bal });
          await replyMessages({ replyToken, messages: [flex] });
        } catch (e: any) {
          await replyText({ replyToken, text: e?.message ?? "ดึงยอดไม่สำเร็จ" });
        }
        continue;
      }

      if (cmd.kind === "summary") {
        try {
          const s = await getPettyCashSummary(admin);
          const flex = createPettyCashSummaryFlexMessage({
            balance: s.balance,
            todayTopUp: s.todayTopUp,
            todaySpend: s.todaySpend,
            monthTopUp: s.monthTopUp,
            monthSpend: s.monthSpend,
          });
          await replyMessages({ replyToken, messages: [flex] });
        } catch (e: any) {
          const msg = String(e?.message ?? "");
          if (msg.toLowerCase().includes("petty_cash_summary") && msg.toLowerCase().includes("does not exist")) {
            await replyText({ replyToken, text: "ระบบสรุป /pc ยังไม่พร้อมใช้งาน กรุณา apply migration petty_cash_summary_rpc.sql ใน Supabase ก่อน" });
          } else {
            await replyText({ replyToken, text: msg || "ดึงสรุปไม่สำเร็จ" });
          }
        }
        continue;
      }

      if (cmd.kind === "last") {
        const limit = Number.isFinite(cmd.limit) ? cmd.limit : 5;
        const res = await admin
          .from("petty_cash_transactions")
          .select("txn_type,amount,occurred_at,category_name,title")
          .order("occurred_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(limit);
        if (res.error) {
          await replyText({ replyToken, text: res.error.message });
          continue;
        }
        const rows = (res.data ?? []) as any[];
        if (!rows.length) {
          await replyText({ replyToken, text: "ยังไม่มีรายการเงินสดย่อย" });
          continue;
        }
        let bal: number | null = null;
        try {
          bal = await getPettyCashBalance(admin);
        } catch {
        }
        const flex = createPettyCashLastFlexMessage({ rows, balance: bal });
        await replyMessages({ replyToken, messages: [flex] });
        continue;
      }

      if (cmd.kind === "transaction") {
        const categories = await getActivePettyCashCategories(admin);
        const allowOther = categories.includes("อื่นๆ") ? "อื่นๆ" : (categories[categories.length - 1] ?? "อื่นๆ");
        const categoryInput = cmd.categoryInput;
        const resolved = resolvePettyCashCategory({ input: categoryInput, allowed: categories });
        const defaultCategory = cmd.txnType === "SPEND" ? allowOther : null;

        if (cmd.txnType === "SPEND" && categoryInput && !resolved.ok) {
          await createPending(admin, {
            lineUserId,
            payload: {
              categoryInput,
              suggestions: resolved.suggestions,
              allowedAll: categories,
              txn: {
                txnType: cmd.txnType,
                amount: cmd.amount,
                occurredAt: cmd.occurredAt,
                title: cmd.title,
                referenceUrl: cmd.referenceUrl,
                rawText: cmd.rawText,
              },
            },
          });
          await replyText({ replyToken, text: formatCategoryConfirmMessage({ input: categoryInput, suggestions: resolved.suggestions, allowedAll: categories }) });
          continue;
        }

        const categoryName = cmd.txnType === "SPEND" ? resolved.categoryName ?? defaultCategory : null;

        try {
          await insertPettyCashTxn(admin, {
            profileId,
            lineUserId,
            txnType: cmd.txnType,
            amount: cmd.amount,
            occurredAt: cmd.occurredAt,
            categoryName,
            title: cmd.title,
            referenceUrl: cmd.referenceUrl,
            rawText: cmd.rawText,
          });
          const bal = await getPettyCashBalance(admin);
          const flex = createPettyCashTxnSavedFlexMessage({
            txnType: cmd.txnType,
            amount: cmd.amount,
            occurredAt: cmd.occurredAt || null,
            categoryName,
            balance: bal,
          });
          await replyMessages({ replyToken, messages: [flex] });
        } catch (e: any) {
          await replyText({ replyToken, text: e?.message ?? "บันทึกไม่สำเร็จ" });
        }
        continue;
      }

      continue;
    }

    const tokenRow = await admin
      .from("line_link_tokens")
      .select("token,profile_id,expires_at,used_at")
      .eq("token", linkToken)
      .maybeSingle();

    if (tokenRow.error || !tokenRow.data) {
      await replyText({ replyToken, text: "โค้ดไม่ถูกต้อง กรุณาสร้าง QR ใหม่ในหน้า ตั้งค่าผู้ใช้" });
      continue;
    }

    const expiresAt = new Date(String((tokenRow.data as any).expires_at));
    const usedAt = (tokenRow.data as any).used_at;
    if (usedAt) {
      await replyText({ replyToken, text: "โค้ดนี้ถูกใช้งานแล้ว กรุณาสร้าง QR ใหม่ในหน้า ตั้งค่าผู้ใช้" });
      continue;
    }
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      await replyText({ replyToken, text: "โค้ดหมดอายุ กรุณาสร้าง QR ใหม่ในหน้า ตั้งค่าผู้ใช้" });
      continue;
    }

    const profileId = String((tokenRow.data as any).profile_id);
    const now = new Date().toISOString();

    const upRes = await admin
      .from("profiles")
      .update({ line_user_id: lineUserId, line_linked_at: now })
      .eq("id", profileId);

    if (upRes.error) {
      await replyText({ replyToken, text: "เชื่อมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
      continue;
    }

    const markRes = await admin.from("line_link_tokens").update({ used_at: now }).eq("token", linkToken);
    if (markRes.error) {
      await replyText({ replyToken, text: "เชื่อมสำเร็จ แต่บันทึกสถานะไม่สมบูรณ์ กรุณาตรวจสอบหน้า ตั้งค่าผู้ใช้" });
      continue;
    }

    await replyText({ replyToken, text: "เชื่อมบัญชีสำเร็จแล้ว คุณจะได้รับการแจ้งเตือนตามที่ตั้งค่าไว้" });
  }

  return NextResponse.json({ ok: true });
}
