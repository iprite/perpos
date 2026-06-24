import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "../../_lib/supabase";
import { triggerSttWorker } from "@/lib/assistant/stt-trigger";
import { triggerPdfWorker } from "@/lib/assistant/pdf-trigger";
import { sendLineMessages } from "@/lib/line/send-messages";
import {
  extractMeetingUrl,
  makeDedupKey,
  normalizeMeetingUrl,
  leaveBot,
  deleteScheduledBot,
  parseMeetingDateTime,
} from "@/lib/assistant/recall";
import {
  BOT_MIN_START,
  BOT_LOW_QUOTA,
  getBotRemaining,
  hasActiveBotForMeeting,
  createBotForHeldJob,
  type HeldJob,
} from "@/lib/assistant/recall-bot";
import { buildBotFlex } from "@/lib/assistant/recall-events";
import { getServiceRemaining, getTokenBalance } from "@/lib/assistant/token-balance";
import {
  buildBotConfirmFlex,
  buildQuotaTopupFlex,
  buildConnectCalendarFlex,
  buildCalendarSavedFlex,
} from "@/lib/assistant/bot-flex";
import { getCalendarAccessTokenForProfile, createCalendarEvent } from "@/lib/google/calendar";
import { provisionLineUser } from "../_provision";
import { upsertMobileToken } from "../../tmc/mobile/_lib";
import {
  handleCrmCmd,
  handleCrmIn,
  handleCrmOut,
  handleCrmInStatus,
  handleCrmStatus,
  handleCrmNotes,
  handleCrmIssues,
  handleCrmHours,
  handleCrmSolutions,
  handleCrmPhoto,
  crmHelpText,
} from "../../crm/_line";
import { handleJustMeClock } from "../../just-me/_line";
import { answerFlowQuestion, isProductQuestion } from "@/lib/assistant/flow-rag";

// ผู้ช่วยโฟล์ (RAG) เรียก Gemini แบบ inline ก่อน reply — เผื่อเวลาให้พอ (Hobby default 10 วิ สั้นไป)
export const maxDuration = 30;

// ─── TMC Org ID (TMC Management) ─────────────────────────────────────────────
const TMC_ORG_ID = "1f52618c-09c4-49c5-a929-ea5060f26e7d";

// ─── TMC LINE helpers ─────────────────────────────────────────────────────────

async function getTmcMembership(admin: ReturnType<typeof createAdminClient>, profileId: string) {
  const { data } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", TMC_ORG_ID)
    .eq("user_id", profileId)
    .maybeSingle();
  return data as { role: string } | null;
}

// ─── Account IDs ──────────────────────────────────────────────────────────────
const ACC_SAVINGS = "a4ee27ea-6568-4097-abd7-a91fbf4805d0"; // กสิกร ออมทรัพย์
const ACC_CURRENT = "273463cc-2475-439c-acfe-f054be5ffee4"; // กสิกร กระแสรายวัน

const RAB_USAGE =
  "📌 รูปแบบ: /รับ <จำนวน> [หมวด] [แปลง] [@บัญชี]\n\n" +
  "ตัวอย่าง:\n" +
  "• /รับ 31900\n" +
  "• /รับ 31900 รายรับ ค่าเช่า TMC1\n" +
  "• /รับ 5000 ค่ามัดจำ TMC7 @กระแส\n\n" +
  "หมวดรายรับ: รายรับ ค่าเช่า, ค่ามัดจำ, คืนเงินมัดจำ\n" +
  "แปลง: TMC1 TMC2 TMC3-4 TMC5 TMC6 TMC7 ส่วนกลาง\n" +
  "บัญชี: @ออม (default), @กระแส";

const JAI_USAGE =
  "📌 รูปแบบ: /จ่าย <จำนวน> [หมวด] [แปลง] [@บัญชี]\n\n" +
  "ตัวอย่าง:\n" +
  "• /จ่าย 1630 ค่าอาหาร\n" +
  "• /จ่าย 2500 ค่าแรง(เงินเดือน+จ้างนอก) ส่วนกลาง\n" +
  "• /จ่าย 800 ซักผ้า TMC1 @กระแส\n\n" +
  "หมวดรายจ่าย: ค่าอาหาร, ค่าแรง, ค่าไฟ, ค่าน้ำ, ซักผ้า\n" +
  "ล้างแอร์, ค่าของใช้ทั่วไป, ค่าใช้จ่ายอื่นๆ\n" +
  "แปลง: TMC1 TMC2 TMC3-4 TMC5 TMC6 TMC7 ส่วนกลาง\n" +
  "บัญชี: @ออม (default), @กระแส";

/** แยก @บัญชี tag ออกจาก args และ resolve accountId */
function resolveAccount(args: string[]): {
  accountId: string;
  accountLabel: string;
  cleanArgs: string[];
} {
  const accIdx = args.findIndex((a) => a.startsWith("@"));
  let accountId = ACC_SAVINGS;
  let accountLabel = "ออมทรัพย์";
  const cleanArgs = [...args];
  if (accIdx !== -1) {
    const tag = args[accIdx].toLowerCase();
    if (tag.includes("กระแส") || tag === "@cur" || tag === "@current") {
      accountId = ACC_CURRENT;
      accountLabel = "กระแสรายวัน";
    }
    cleanArgs.splice(accIdx, 1);
  }
  return { accountId, accountLabel, cleanArgs };
}

/** ยอดเดือนนี้ของบัญชี */
async function getMonthlyBalance(
  admin: ReturnType<typeof createAdminClient>,
  accountId?: string,
): Promise<{ income: number; expense: number; label: string }> {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  let q = admin
    .from("tmc_finance_entries")
    .select("income, expense, tmc_accounts(name)")
    .eq("org_id", TMC_ORG_ID)
    .gte("entry_date", from);

  if (accountId) {
    q = q.eq("account_id", accountId) as typeof q;
  } else {
    q = q.neq("account_id", "2366c3f9-dcc5-4091-8ab0-c421b77e7fe7") as typeof q; // ไม่รวมเงินสดย่อย
  }

  const { data } = await q;
  const rows = (data ?? []) as { income: number | null; expense: number | null }[];
  const income = rows.reduce((s, r) => s + Number(r.income ?? 0), 0);
  const expense = rows.reduce((s, r) => s + Number(r.expense ?? 0), 0);

  const month = now.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  return { income, expense, label: month };
}

async function handleTmcRab(
  admin: ReturnType<typeof createAdminClient>,
  args: string[],
  profileId: string,
  replyToken: string,
) {
  if (!args[0]) return replyText(replyToken, `❌ ยังไม่ระบุจำนวนเงิน\n\n${RAB_USAGE}`);
  const amount = parseFloat(args[0]);
  if (isNaN(amount)) return replyText(replyToken, `❌ "${args[0]}" ไม่ใช่ตัวเลข\n\n${RAB_USAGE}`);
  if (amount <= 0) return replyText(replyToken, `❌ จำนวนเงินต้องมากกว่า 0\n\n${RAB_USAGE}`);

  const { accountId, accountLabel, cleanArgs } = resolveAccount(args.slice(1));
  const category = cleanArgs[0] ?? "รายรับ ค่าเช่า";
  const propertyCode = cleanArgs[1] ?? "ส่วนกลาง";

  const { data: prop } = await admin
    .from("tmc_properties")
    .select("id")
    .eq("org_id", TMC_ORG_ID)
    .eq("code", propertyCode)
    .maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  await admin.from("tmc_finance_entries").insert({
    org_id: TMC_ORG_ID,
    account_id: accountId,
    entry_date: today,
    description: `[LINE] รายรับ ${category} ${propertyCode}`,
    category,
    property_id: prop?.id ?? null,
    property_code: propertyCode,
    income: amount,
    created_by: profileId,
  });

  const bal = await getMonthlyBalance(admin, accountId);
  return replyText(
    replyToken,
    `✅ บันทึกรายรับ +${amount.toLocaleString("th-TH")} บาท\n` +
      `หมวด: ${category}\nแปลง: ${propertyCode}\nบัญชี: ${accountLabel}\n\n` +
      `📊 ${bal.label}:\n` +
      `รายรับ: ${bal.income.toLocaleString("th-TH")} บาท\n` +
      `รายจ่าย: ${bal.expense.toLocaleString("th-TH")} บาท\n` +
      `สุทธิ: ${(bal.income - bal.expense).toLocaleString("th-TH")} บาท`,
  );
}

async function handleTmcJai(
  admin: ReturnType<typeof createAdminClient>,
  args: string[],
  profileId: string,
  replyToken: string,
) {
  if (!args[0]) return replyText(replyToken, `❌ ยังไม่ระบุจำนวนเงิน\n\n${JAI_USAGE}`);
  const amount = parseFloat(args[0]);
  if (isNaN(amount)) return replyText(replyToken, `❌ "${args[0]}" ไม่ใช่ตัวเลข\n\n${JAI_USAGE}`);
  if (amount <= 0) return replyText(replyToken, `❌ จำนวนเงินต้องมากกว่า 0\n\n${JAI_USAGE}`);

  const { accountId, accountLabel, cleanArgs } = resolveAccount(args.slice(1));
  const category = cleanArgs[0] ?? "ค่าใช้จ่ายอื่นๆ";
  const propertyCode = cleanArgs[1] ?? "ส่วนกลาง";

  const { data: prop } = await admin
    .from("tmc_properties")
    .select("id")
    .eq("org_id", TMC_ORG_ID)
    .eq("code", propertyCode)
    .maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  await admin.from("tmc_finance_entries").insert({
    org_id: TMC_ORG_ID,
    account_id: accountId,
    entry_date: today,
    description: `[LINE] รายจ่าย ${category} ${propertyCode}`,
    category,
    property_id: prop?.id ?? null,
    property_code: propertyCode,
    expense: amount,
    created_by: profileId,
  });

  const bal = await getMonthlyBalance(admin, accountId);
  return replyText(
    replyToken,
    `✅ บันทึกรายจ่าย -${amount.toLocaleString("th-TH")} บาท\n` +
      `หมวด: ${category}\nแปลง: ${propertyCode}\nบัญชี: ${accountLabel}\n\n` +
      `📊 ${bal.label}:\n` +
      `รายรับ: ${bal.income.toLocaleString("th-TH")} บาท\n` +
      `รายจ่าย: ${bal.expense.toLocaleString("th-TH")} บาท\n` +
      `สุทธิ: ${(bal.income - bal.expense).toLocaleString("th-TH")} บาท`,
  );
}

/** /บัญชี [สรุป|ออม|กระแส] — ดูยอดบัญชีเดือนนี้ */
async function handleTmcBill(
  admin: ReturnType<typeof createAdminClient>,
  args: string[],
  replyToken: string,
) {
  const sub = args[0]?.toLowerCase() ?? "";
  const isGra = sub.includes("กระแส") || sub === "cur";
  const isOom = sub.includes("ออม") || sub === "sav";

  if (isGra || isOom) {
    // แสดงเฉพาะบัญชีนั้น
    const accountId = isGra ? ACC_CURRENT : ACC_SAVINGS;
    const label = isGra ? "กระแสรายวัน" : "ออมทรัพย์";
    const bal = await getMonthlyBalance(admin, accountId);
    return replyText(
      replyToken,
      `🏦 บัญชี ${label} — ${bal.label}\n\n` +
        `รายรับ:  ${bal.income.toLocaleString("th-TH")} บาท\n` +
        `รายจ่าย: ${bal.expense.toLocaleString("th-TH")} บาท\n` +
        `─────────────────\n` +
        `สุทธิ:   ${(bal.income - bal.expense).toLocaleString("th-TH")} บาท`,
    );
  }

  // สรุปทั้งหมด (ทุกบัญชียกเว้นเงินสดย่อย)
  const [oom, gra] = await Promise.all([
    getMonthlyBalance(admin, ACC_SAVINGS),
    getMonthlyBalance(admin, ACC_CURRENT),
  ]);
  const pettyBal = await (async () => {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const { data } = await admin
      .from("tmc_petty_cash_txns")
      .select("txn_type, amount")
      .eq("org_id", TMC_ORG_ID)
      .gte("txn_date", from);
    const rows = (data ?? []) as { txn_type: string; amount: number }[];
    const exp = rows
      .filter((r) => r.txn_type === "expense")
      .reduce((s, r) => s + Number(r.amount), 0);
    return exp;
  })();

  const totalIn = oom.income + gra.income;
  const totalOut = oom.expense + gra.expense + pettyBal;

  return replyText(
    replyToken,
    `📊 สรุปบัญชี TMC — ${oom.label}\n\n` +
      `🏦 ออมทรัพย์\n` +
      `  รับ ${oom.income.toLocaleString("th-TH")} / จ่าย ${oom.expense.toLocaleString("th-TH")}\n` +
      `  สุทธิ ${(oom.income - oom.expense).toLocaleString("th-TH")} บาท\n\n` +
      `🏦 กระแสรายวัน\n` +
      `  รับ ${gra.income.toLocaleString("th-TH")} / จ่าย ${gra.expense.toLocaleString("th-TH")}\n` +
      `  สุทธิ ${(gra.income - gra.expense).toLocaleString("th-TH")} บาท\n\n` +
      `💵 เงินสดย่อย จ่าย ${pettyBal.toLocaleString("th-TH")} บาท\n\n` +
      `─────────────────\n` +
      `รายรับรวม:  ${totalIn.toLocaleString("th-TH")} บาท\n` +
      `รายจ่ายรวม: ${totalOut.toLocaleString("th-TH")} บาท\n` +
      `สุทธิรวม:   ${(totalIn - totalOut).toLocaleString("th-TH")} บาท\n\n` +
      `💡 /บัญชี ออม  หรือ  /บัญชี กระแส`,
  );
}

// ─── Stock usage strings ──────────────────────────────────────────────────────

const STK_IN_USAGE =
  "📌 รูปแบบ: /stkin <ชื่อสินค้า> <จำนวน> [แปลง]\n\n" +
  "ตัวอย่าง:\n" +
  "• /stkin ผ้าขนหนู 20\n" +
  "• /stkin สบู่ 50 TMC1\n" +
  "• /stkin น้ำยาซักผ้า 10 ส่วนกลาง\n\n" +
  "แปลง: TMC1 TMC2 TMC3-4 TMC5 TMC6 TMC7 ส่วนกลาง";

const STK_OUT_USAGE =
  "📌 รูปแบบ: /stkout <ชื่อสินค้า> <จำนวน> [แปลง]\n\n" +
  "ตัวอย่าง:\n" +
  "• /stkout ผ้าขนหนู 5\n" +
  "• /stkout สบู่ 3 TMC2\n" +
  "• /stkout กระดาษชำระ 2 TMC7\n\n" +
  "แปลง: TMC1 TMC2 TMC3-4 TMC5 TMC6 TMC7 ส่วนกลาง";

// ─── Push multicast helper ────────────────────────────────────────────────────

async function pushLineToUsers(lineUserIds: string[], text: string) {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? "";
  if (!token || !lineUserIds.length) return;
  // LINE multicast supports up to 500 recipients per call
  const chunks: string[][] = [];
  for (let i = 0; i < lineUserIds.length; i += 500) {
    chunks.push(lineUserIds.slice(i, i + 500));
  }
  for (const chunk of chunks) {
    await fetch("https://api.line.me/v2/bot/message/multicast", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ to: chunk, messages: [{ type: "text", text }] }),
    });
  }
}

/** ดึง line_user_id ของสมาชิก TMC ทุกคนที่ผูก LINE แล้ว */
async function getTmcLineUserIds(admin: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const { data } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", TMC_ORG_ID);
  if (!data?.length) return [];

  const userIds = (data as { user_id: string }[]).map((m) => m.user_id);
  const { data: profiles } = await admin
    .from("profiles")
    .select("line_user_id")
    .in("id", userIds)
    .not("line_user_id", "is", null);

  return (
    (profiles as { line_user_id: string }[] | null)?.map((p) => p.line_user_id).filter(Boolean) ??
    []
  );
}

/** ตรวจสต๊อกหลัง movement — ถ้าถึงขั้นต่ำให้ push แจ้งเตือน */
async function checkAndAlertLowStock(admin: ReturnType<typeof createAdminClient>, itemId: string) {
  const { data: item } = await admin
    .from("tmc_stock_items")
    .select("name, unit, current_qty, min_quantity")
    .eq("id", itemId)
    .single();

  if (!item) return;
  const { name, unit, current_qty, min_quantity } = item as {
    name: string;
    unit: string;
    current_qty: number;
    min_quantity: number;
  };
  if (min_quantity <= 0 || current_qty > min_quantity) return;

  const lineIds = await getTmcLineUserIds(admin);
  if (!lineIds.length) return;

  await pushLineToUsers(
    lineIds,
    `⚠️ แจ้งเตือน: สินค้าใกล้หมด!\n\n` +
      `📦 ${name}\n` +
      `คงเหลือ: ${current_qty} ${unit}\n` +
      `ขั้นต่ำ: ${min_quantity} ${unit}\n\n` +
      `กรุณาสั่งซื้อเพิ่ม`,
  );
}

// ─── Shared: record a stock movement & return updated item ────────────────────

type StockMovResult = {
  ok: boolean;
  item?: { id: string; name: string; unit: string; current_qty: number; min_quantity: number };
  error?: string;
};

async function recordStockMovement(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  itemName: string,
  movType: "in" | "out",
  qty: number,
  propertyCode: string | null,
  profileId: string,
): Promise<StockMovResult> {
  // ค้นหาสินค้าด้วยชื่อ (partial match)
  const { data: item } = await admin
    .from("tmc_stock_items")
    .select("id, name, current_qty, unit, min_quantity")
    .eq("org_id", orgId)
    .ilike("name", `%${itemName}%`)
    .eq("is_active", true)
    .order("name")
    .limit(1)
    .maybeSingle();

  if (!item) {
    return {
      ok: false,
      error: `❌ ไม่พบสินค้า "${itemName}"\nลองใช้ชื่อย่อหรือบางส่วนของชื่อ\nดูรายการทั้งหมด: /stk`,
    };
  }

  const { data: prop } = propertyCode
    ? await admin
        .from("tmc_properties")
        .select("id")
        .eq("org_id", orgId)
        .eq("code", propertyCode)
        .maybeSingle()
    : { data: null };

  const { error: movErr } = await admin.from("tmc_stock_movements").insert({
    org_id: orgId,
    item_id: item.id,
    movement_type: movType,
    quantity: qty,
    property_id: prop?.id ?? null,
    property_code: propertyCode,
    created_by: profileId,
  });
  if (movErr) return { ok: false, error: `❌ บันทึกไม่สำเร็จ: ${movErr.message}` };

  // อ่านค่า current_qty ล่าสุด
  const { data: updated } = await admin
    .from("tmc_stock_items")
    .select("id, name, unit, current_qty, min_quantity")
    .eq("id", (item as { id: string }).id)
    .single();

  return { ok: true, item: updated as StockMovResult["item"] };
}

// ─── /stkin — รับสินค้าเข้า ───────────────────────────────────────────────────
async function handleStkIn(
  admin: ReturnType<typeof createAdminClient>,
  args: string[],
  profileId: string,
  replyToken: string,
) {
  if (!args[0]) return replyText(replyToken, `❌ ยังไม่ระบุชื่อสินค้า\n\n${STK_IN_USAGE}`);

  const itemName = args[0];
  const qty = parseFloat(args[1] ?? "");
  const propertyCode = args[2]?.trim() || null;

  if (!args[1] || isNaN(qty)) return replyText(replyToken, `❌ ยังไม่ระบุจำนวน\n\n${STK_IN_USAGE}`);
  if (qty <= 0) return replyText(replyToken, `❌ จำนวนต้องมากกว่า 0\n\n${STK_IN_USAGE}`);

  const validProps = ["TMC1", "TMC2", "TMC3-4", "TMC5", "TMC6", "TMC7", "ส่วนกลาง"];
  if (propertyCode && !validProps.includes(propertyCode)) {
    return replyText(
      replyToken,
      `❌ แปลง "${propertyCode}" ไม่ถูกต้อง\nแปลงที่ใช้ได้: ${validProps.join(", ")}\n\n${STK_IN_USAGE}`,
    );
  }

  const result = await recordStockMovement(
    admin,
    TMC_ORG_ID,
    itemName,
    "in",
    qty,
    propertyCode,
    profileId,
  );
  if (!result.ok || !result.item)
    return replyText(replyToken, result.error ?? "❌ บันทึกไม่สำเร็จ");

  const { name, unit, current_qty, min_quantity } = result.item;
  const lowWarn =
    min_quantity > 0 && current_qty <= min_quantity
      ? `\n⚠️ สินค้าคงเหลือถึงขั้นต่ำ (${min_quantity} ${unit})`
      : "";

  return replyText(
    replyToken,
    `✅ รับสินค้าเข้า +${qty} ${unit}\n` +
      `📦 ${name}\n` +
      (propertyCode ? `แปลง: ${propertyCode}\n` : "") +
      `คงเหลือ: ${current_qty} ${unit}${lowWarn}`,
  );
}

// ─── /stkout — เบิกสินค้าออก ─────────────────────────────────────────────────
async function handleStkOut(
  admin: ReturnType<typeof createAdminClient>,
  args: string[],
  profileId: string,
  replyToken: string,
) {
  if (!args[0]) return replyText(replyToken, `❌ ยังไม่ระบุชื่อสินค้า\n\n${STK_OUT_USAGE}`);

  const itemName = args[0];
  const qty = parseFloat(args[1] ?? "");
  const propertyCode = args[2]?.trim() || null;

  if (!args[1] || isNaN(qty))
    return replyText(replyToken, `❌ ยังไม่ระบุจำนวน\n\n${STK_OUT_USAGE}`);
  if (qty <= 0) return replyText(replyToken, `❌ จำนวนต้องมากกว่า 0\n\n${STK_OUT_USAGE}`);

  const validProps = ["TMC1", "TMC2", "TMC3-4", "TMC5", "TMC6", "TMC7", "ส่วนกลาง"];
  if (propertyCode && !validProps.includes(propertyCode)) {
    return replyText(
      replyToken,
      `❌ แปลง "${propertyCode}" ไม่ถูกต้อง\nแปลงที่ใช้ได้: ${validProps.join(", ")}\n\n${STK_OUT_USAGE}`,
    );
  }

  const result = await recordStockMovement(
    admin,
    TMC_ORG_ID,
    itemName,
    "out",
    qty,
    propertyCode,
    profileId,
  );
  if (!result.ok || !result.item)
    return replyText(replyToken, result.error ?? "❌ บันทึกไม่สำเร็จ");

  const { name, unit, current_qty, min_quantity } = result.item;
  const isLow = min_quantity > 0 && current_qty <= min_quantity;
  const lowWarn = isLow ? `\n⚠️ สินค้าใกล้หมด! (ขั้นต่ำ ${min_quantity} ${unit})` : "";

  await replyText(
    replyToken,
    `✅ เบิกสินค้าออก -${qty} ${unit}\n` +
      `📦 ${name}\n` +
      (propertyCode ? `แปลง: ${propertyCode}\n` : "") +
      `คงเหลือ: ${current_qty} ${unit}${lowWarn}`,
  );

  // push alert ถ้าถึงขั้นต่ำ
  if (isLow) {
    await checkAndAlertLowStock(admin, result.item.id);
  }
}

// ─── /stk — ดูรายการสต๊อก ────────────────────────────────────────────────────
async function handleStkBal(admin: ReturnType<typeof createAdminClient>, replyToken: string) {
  const { data: items } = await admin
    .from("tmc_stock_items")
    .select("name, unit, current_qty, min_quantity")
    .eq("org_id", TMC_ORG_ID)
    .eq("is_active", true)
    .order("name");

  if (!items?.length) return replyText(replyToken, "❌ ยังไม่มีรายการสินค้าในคลัง");

  type Item = { name: string; unit: string; current_qty: number; min_quantity: number };
  const list = items as Item[];

  // เรียงใกล้หมดขึ้นก่อน
  list.sort((a, b) => {
    const aLow = a.min_quantity > 0 && a.current_qty <= a.min_quantity ? 0 : 1;
    const bLow = b.min_quantity > 0 && b.current_qty <= b.min_quantity ? 0 : 1;
    return aLow - bLow || a.name.localeCompare(b.name);
  });

  const lines = list.map((i) => {
    const isLow = i.min_quantity > 0 && i.current_qty <= i.min_quantity;
    const icon = isLow ? "⚠️" : "✅";
    return `${icon} ${i.name}: ${i.current_qty} ${i.unit}`;
  });

  const lowCount = list.filter((i) => i.min_quantity > 0 && i.current_qty <= i.min_quantity).length;
  const header =
    lowCount > 0
      ? `📦 สต๊อกคลัง (⚠️ ใกล้หมด ${lowCount} รายการ):\n\n`
      : `📦 สต๊อกคลัง (${list.length} รายการ):\n\n`;

  return replyText(replyToken, header + lines.join("\n"));
}

// ─── (compat) /stock รับ|ออก — เรียกใช้ shared helper ───────────────────────
async function handleTmcStock(
  admin: ReturnType<typeof createAdminClient>,
  subCmd: string,
  args: string[],
  profileId: string,
  replyToken: string,
) {
  const itemName = args[0] ?? "";
  const qty = parseFloat(args[1] ?? "");
  const propertyCode = args[2] ?? null;
  if (!itemName || !qty || isNaN(qty)) {
    return replyText(
      replyToken,
      "❌ รูปแบบไม่ถูกต้อง\n\n" + `${subCmd === "รับ" ? STK_IN_USAGE : STK_OUT_USAGE}`,
    );
  }
  const movType: "in" | "out" = subCmd === "รับ" ? "in" : "out";
  const result = await recordStockMovement(
    admin,
    TMC_ORG_ID,
    itemName,
    movType,
    qty,
    propertyCode,
    profileId,
  );
  if (!result.ok || !result.item)
    return replyText(replyToken, result.error ?? "❌ บันทึกไม่สำเร็จ");

  const { name, unit, current_qty, min_quantity } = result.item;
  const isLow = min_quantity > 0 && current_qty <= min_quantity;
  await replyText(
    replyToken,
    `✅ ${subCmd === "รับ" ? "รับเข้า" : "เบิกออก"} ${name} ${qty} ${unit}\n` +
      (propertyCode ? `แปลง: ${propertyCode}\n` : "") +
      `คงเหลือ: ${current_qty} ${unit}` +
      (isLow ? `\n⚠️ สินค้าใกล้หมด!` : ""),
  );
  if (isLow && movType === "out") {
    await checkAndAlertLowStock(admin, result.item.id);
  }
}

async function handleTmcCheckin(
  admin: ReturnType<typeof createAdminClient>,
  args: string[],
  profileId: string,
  replyToken: string,
) {
  // /เช็คอิน <ชื่อ> <แปลง> <วันออก> [ยอด] [ช่องทาง]
  // e.g. /เช็คอิน คุณวชิราภรณ์ TMC7 2026-05-22 31900 Line
  const firstName = args[0] ?? "";
  const propertyCode = args[1] ?? "";
  const checkOut = args[2] ?? "";
  if (!firstName || !propertyCode || !checkOut) {
    return replyText(replyToken, "❌ เช่น /เช็คอิน คุณวชิราภรณ์ TMC7 2026-05-22 31900 Line");
  }
  const roomRate = args[3] ? parseFloat(args[3]) : null;
  const channel = args[4] ?? "Line";
  const today = new Date().toISOString().slice(0, 10);

  const { data: prop } = await admin
    .from("tmc_properties")
    .select("id")
    .eq("org_id", TMC_ORG_ID)
    .eq("code", propertyCode)
    .maybeSingle();

  // Upsert guest (no tel from LINE)
  const { data: guest } = await admin
    .from("tmc_guests")
    .insert({ org_id: TMC_ORG_ID, first_name: firstName })
    .select("id")
    .single();

  await admin.from("tmc_stays").insert({
    org_id: TMC_ORG_ID,
    guest_id: guest?.id ?? null,
    property_id: prop?.id ?? null,
    property_code: propertyCode,
    check_in: today,
    check_out: checkOut,
    booking_channel: channel,
    stay_type: roomRate ? "paid" : "free",
    room_rate: roomRate,
    created_by: profileId,
  });

  return replyText(
    replyToken,
    `✅ บันทึกเช็คอิน\n` +
      `ลูกค้า: ${firstName}\nแปลง: ${propertyCode}\n` +
      `วันออก: ${checkOut}` +
      (roomRate ? `\nยอด: ${roomRate.toLocaleString("th-TH")} บาท` : ""),
  );
}

async function handleTmcHelp(replyToken: string) {
  return replyText(
    replyToken,
    "📖 คำสั่ง TMC Management\n\n" +
      "─── 💰 บัญชีการเงิน ───\n" +
      "/รับ <จำนวน> [หมวด] [แปลง] [@บัญชี]\n" +
      "  → บันทึกรายรับลงบัญชี\n" +
      "/จ่าย <จำนวน> [หมวด] [แปลง] [@บัญชี]\n" +
      "  → บันทึกรายจ่ายลงบัญชี\n" +
      "/บัญชี         — สรุปยอดทั้งหมดเดือนนี้\n" +
      "/บัญชี ออม    — เฉพาะออมทรัพย์\n" +
      "/บัญชี กระแส  — เฉพาะกระแสรายวัน\n\n" +
      "@บัญชี: @ออม (default) / @กระแส\n\n" +
      "─── 💵 เงินสดย่อย ───\n" +
      "/pcin <จำนวน> [รายการ]  — เติมเงิน\n" +
      "/pcout <จำนวน> <รายการ> [หมวด] [แปลง]\n" +
      "/pcbal   — ยอดคงเหลือ\n\n" +
      "─── 📦 Stock ───\n" +
      "/stkin <ชื่อ> <จำนวน> [แปลง]\n" +
      "/stkout <ชื่อ> <จำนวน> [แปลง]\n" +
      "/stk   — ดูสต๊อกทั้งหมด\n\n" +
      "─── 🏠 เข้าพัก ───\n" +
      "/เช็คอิน <ชื่อ> <แปลง> <วันออก> [ยอด]\n" +
      "/tmc   — ลิงก์บันทึกเข้าพัก\n\n" +
      "แปลง: TMC1 TMC5 TMC7 ส่วนกลาง ฯลฯ",
  );
}

// ─── Petty Cash helpers ───────────────────────────────────────────────────────

/** ดึงกระเป๋าแรก (active) ของ TMC org — ถ้ามีหลายกระเป๋า ให้ระบุชื่อ */
async function getDefaultFund(admin: ReturnType<typeof createAdminClient>, fundHint?: string) {
  let q = admin
    .from("tmc_petty_cash_funds")
    .select("id, name")
    .eq("org_id", TMC_ORG_ID)
    .eq("is_active", true)
    .order("created_at");

  if (fundHint) {
    q = q.ilike("name", `%${fundHint}%`) as typeof q;
  }
  const { data } = await q.limit(1).maybeSingle();
  return data as { id: string; name: string } | null;
}

const PC_IN_USAGE =
  "📌 รูปแบบ: /pcin <จำนวน> [รายการ]\n\n" +
  "ตัวอย่าง:\n" +
  "• /pcin 1000\n" +
  "• /pcin 1000 เติมรอบสัปดาห์\n" +
  "• /pcin 500 รับเงินคืนค่าของ";

const PC_OUT_USAGE =
  "📌 รูปแบบ: /pcout <จำนวน> <รายการ> [หมวด] [แปลง]\n\n" +
  "ตัวอย่าง:\n" +
  "• /pcout 150 ซื้อน้ำดื่ม\n" +
  "• /pcout 300 ซื้อสบู่ ค่าของใช้\n" +
  "• /pcout 80 ค่ารถ ค่าส่งของ TMC1\n\n" +
  "หมวดที่ใช้บ่อย:\n" +
  "ค่าอาหาร, ค่าของใช้, ค่าส่งของ\n" +
  "ซักผ้า, ค่าไฟ, ค่าใช้จ่ายอื่นๆ\n\n" +
  "แปลง: TMC1 TMC2 TMC3-4 TMC5 TMC6 TMC7 ส่วนกลาง";

/** เติมเงินสดย่อย: /pcin <amount> [description] */
async function handlePcIn(
  admin: ReturnType<typeof createAdminClient>,
  args: string[],
  profileId: string,
  replyToken: string,
) {
  // ไม่มี args เลย
  if (!args[0]) {
    return replyText(replyToken, `❌ ยังไม่ระบุจำนวนเงิน\n\n${PC_IN_USAGE}`);
  }

  const amount = parseFloat(args[0]);
  if (isNaN(amount)) {
    return replyText(
      replyToken,
      `❌ "${args[0]}" ไม่ใช่ตัวเลข กรุณาระบุจำนวนเงินเป็นตัวเลข\n\n${PC_IN_USAGE}`,
    );
  }
  if (amount <= 0) {
    return replyText(replyToken, `❌ จำนวนเงินต้องมากกว่า 0\n\n${PC_IN_USAGE}`);
  }

  const description = args.slice(1).join(" ").trim() || "เติมเงินสดย่อย";

  const fund = await getDefaultFund(admin);
  if (!fund) {
    return replyText(
      replyToken,
      "❌ ยังไม่มีกระเป๋าเงินสดย่อย\n" +
        "กรุณาสร้างกระเป๋าในระบบ PERPOS ก่อน\n" +
        "หรือพิมพ์ /pcfunds เพื่อตรวจสอบ",
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await admin.from("tmc_petty_cash_txns").insert({
    fund_id: fund.id,
    org_id: TMC_ORG_ID,
    txn_date: today,
    txn_type: "top_up",
    amount,
    description: `[LINE] ${description}`,
    created_by: profileId,
  });

  if (error) return replyText(replyToken, `❌ บันทึกไม่สำเร็จ: ${error.message}`);

  const bal = await getFundBalance(admin, fund.id);
  return replyText(
    replyToken,
    `✅ เติมเงินสดย่อย +${amount.toLocaleString("th-TH")} บาท\n` +
      `รายการ: ${description}\n` +
      `กระเป๋า: ${fund.name}\n` +
      `💰 คงเหลือ: ${bal.toLocaleString("th-TH")} บาท`,
  );
}

/** ใช้เงินสดย่อย: /pcout <amount> <description> [category] [property_code] */
async function handlePcOut(
  admin: ReturnType<typeof createAdminClient>,
  args: string[],
  profileId: string,
  replyToken: string,
) {
  // ไม่มี args เลย
  if (!args[0]) {
    return replyText(replyToken, `❌ ยังไม่ระบุจำนวนเงิน\n\n${PC_OUT_USAGE}`);
  }

  const amount = parseFloat(args[0]);
  if (isNaN(amount)) {
    return replyText(
      replyToken,
      `❌ "${args[0]}" ไม่ใช่ตัวเลข กรุณาระบุจำนวนเงินเป็นตัวเลข\n\n${PC_OUT_USAGE}`,
    );
  }
  if (amount <= 0) {
    return replyText(replyToken, `❌ จำนวนเงินต้องมากกว่า 0\n\n${PC_OUT_USAGE}`);
  }

  const description = args[1]?.trim() || "";
  if (!description) {
    return replyText(
      replyToken,
      `❌ ยังไม่ระบุรายการ (ต้องระบุว่าซื้ออะไร/ใช้จ่ายอะไร)\n\n${PC_OUT_USAGE}`,
    );
  }

  const category = args[2]?.trim() || null;
  const propertyCode = args[3]?.trim() || null;

  // ตรวจ propertyCode ถ้าระบุมาว่าถูกต้องไหม
  const validProps = ["TMC1", "TMC2", "TMC3-4", "TMC5", "TMC6", "TMC7", "ส่วนกลาง"];
  if (propertyCode && !validProps.includes(propertyCode)) {
    return replyText(
      replyToken,
      `❌ แปลง "${propertyCode}" ไม่ถูกต้อง\n` +
        `แปลงที่ใช้ได้: ${validProps.join(", ")}\n\n${PC_OUT_USAGE}`,
    );
  }

  const fund = await getDefaultFund(admin);
  if (!fund) {
    return replyText(
      replyToken,
      "❌ ยังไม่มีกระเป๋าเงินสดย่อย\n" + "กรุณาสร้างกระเป๋าในระบบ PERPOS ก่อน",
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await admin.from("tmc_petty_cash_txns").insert({
    fund_id: fund.id,
    org_id: TMC_ORG_ID,
    txn_date: today,
    txn_type: "expense",
    amount,
    description: `[LINE] ${description}`,
    category,
    property_code: propertyCode,
    created_by: profileId,
  });

  if (error) return replyText(replyToken, `❌ บันทึกไม่สำเร็จ: ${error.message}`);

  const bal = await getFundBalance(admin, fund.id);
  return replyText(
    replyToken,
    `✅ บันทึกใช้เงินสดย่อย -${amount.toLocaleString("th-TH")} บาท\n` +
      `รายการ: ${description}\n` +
      (category ? `หมวด: ${category}\n` : "") +
      (propertyCode ? `แปลง: ${propertyCode}\n` : "") +
      `กระเป๋า: ${fund.name}\n` +
      `💰 คงเหลือ: ${bal.toLocaleString("th-TH")} บาท`,
  );
}

/** ดูยอดคงเหลือ: /pcbal */
async function handlePcBal(admin: ReturnType<typeof createAdminClient>, replyToken: string) {
  const { data: funds } = await admin
    .from("tmc_petty_cash_funds")
    .select("id, name")
    .eq("org_id", TMC_ORG_ID)
    .eq("is_active", true)
    .order("created_at");

  if (!funds?.length) {
    return replyText(replyToken, "❌ ยังไม่มีกระเป๋าเงินสดย่อย");
  }

  const lines: string[] = ["💰 ยอดเงินสดย่อย:\n"];
  for (const f of funds as { id: string; name: string }[]) {
    const bal = await getFundBalance(admin, f.id);
    lines.push(`${f.name}: ${bal.toLocaleString("th-TH")} บาท`);
  }
  return replyText(replyToken, lines.join("\n"));
}

/** รายชื่อกระเป๋า: /pcfunds */
async function handlePcFunds(admin: ReturnType<typeof createAdminClient>, replyToken: string) {
  const { data: funds } = await admin
    .from("tmc_petty_cash_funds")
    .select("id, name, note")
    .eq("org_id", TMC_ORG_ID)
    .eq("is_active", true)
    .order("created_at");

  if (!funds?.length) {
    return replyText(
      replyToken,
      '❌ ยังไม่มีกระเป๋าเงินสดย่อย\nสร้างกระเป๋าได้ที่เมนู "เงินสดย่อย" ใน PERPOS',
    );
  }

  const lines = (funds as { id: string; name: string; note: string | null }[]).map(
    (f, i) => `${i + 1}. ${f.name}${f.note ? ` (${f.note})` : ""}`,
  );

  return replyText(
    replyToken,
    `📋 กระเป๋าเงินสดย่อย (${funds.length} กระเป๋า):\n\n` +
      lines.join("\n") +
      "\n\n" +
      "ใช้ /pcin หรือ /pcout เพื่อบันทึกรายการ",
  );
}

/** คำนวณยอดคงเหลือของกระเป๋า */
async function getFundBalance(
  admin: ReturnType<typeof createAdminClient>,
  fundId: string,
): Promise<number> {
  const { data } = await admin
    .from("tmc_petty_cash_txns")
    .select("txn_type, amount")
    .eq("fund_id", fundId);

  if (!data) return 0;
  return (data as { txn_type: string; amount: number }[]).reduce((sum, t) => {
    return sum + (t.txn_type === "top_up" ? t.amount : -t.amount);
  }, 0);
}

// ─── Signature ────────────────────────────────────────────────────────────────

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.LINE_MESSAGING_CHANNEL_SECRET ?? "";
  if (!secret || !signature) return false;
  const computed = crypto.createHmac("sha256", secret).update(body).digest("base64");
  try {
    const a = Buffer.from(computed);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ─── LINE push helper ─────────────────────────────────────────────────────────

async function replyLine(replyToken: string, messages: unknown[]) {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? "";
  if (!token) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages }),
  });
}

function replyText(replyToken: string, text: string) {
  return replyLine(replyToken, [{ type: "text", text }]);
}

/**
 * แจ้งปัญหาเข้า Issue Tracker (system_issues) — คำสั่ง /แจ้งปัญหา · /bug · /report
 * ผู้ใช้ LINE ทุกคนเป็น Flow user (provisioned) → reported_by ผูก profile เสมอ ·
 * กันสแปม: dedup ต่อ line_message_id + rate-limit 5/คน/วัน · สร้าง status='open' (รอ admin triage)
 */
async function handleReportIssue(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  lineUserId: string,
  reportText: string,
  messageId: string,
  replyToken: string,
) {
  const text = reportText.trim();
  if (!text) {
    return replyText(
      replyToken,
      "📝 วิธีแจ้งปัญหา\nพิมพ์ /แจ้งปัญหา ตามด้วยรายละเอียด\nเช่น: /แจ้งปัญหา กดบันทึกใบเสนอราคาแล้วขึ้น error",
    );
  }

  // dedup ต่อ line message id (กัน LINE redeliver → สร้างซ้ำ)
  const dedupKey = messageId ? `line:${messageId}` : null;
  if (dedupKey) {
    const { data: existing } = await admin
      .from("system_issues")
      .select("ref")
      .eq("dedup_key", dedupKey)
      .maybeSingle();
    if (existing) return replyText(replyToken, `รับเรื่องนี้ไว้แล้วครับ — ${existing.ref}`);
  }

  // rate-limit 5/คน/วัน
  const { data: allowed } = await admin.rpc("incr_issue_report_usage", {
    p_line_user_id: lineUserId,
    p_daily_limit: 5,
  });
  if (allowed === false) {
    return replyText(
      replyToken,
      "⚠️ วันนี้แจ้งปัญหาครบ 5 เรื่องแล้ว\nลองใหม่พรุ่งนี้ หรือทักทีมงานโดยตรงได้เลยครับ",
    );
  }

  const title = text.length > 80 ? text.slice(0, 77) + "…" : text;
  const { data: ref, error } = await admin.rpc("agent_create_issue", {
    p_type: "bug",
    p_title: title,
    p_severity: "sev2",
    p_symptom: text,
    p_status: "open",
    p_actor: `line:${lineUserId}`,
    p_reported_by: profileId,
    p_reporter_note: "แจ้งผ่าน LINE",
    p_dedup_key: dedupKey,
  });
  if (error || !ref) {
    return replyText(replyToken, "ขออภัย ระบบขัดข้องชั่วคราว ลองแจ้งใหม่อีกครั้งนะครับ 🙏");
  }

  await replyText(
    replyToken,
    `✅ รับเรื่องแล้ว — ${ref}\nทีมงานจะตรวจสอบและดำเนินการครับ ขอบคุณที่แจ้ง 🙏`,
  );
  await notifySuperAdminsOfIssue(admin, String(ref), title).catch(() => {});
}

/** push แจ้ง super_admin (ที่ผูก LINE) เมื่อมี issue ใหม่จาก LINE */
async function notifySuperAdminsOfIssue(
  admin: ReturnType<typeof createAdminClient>,
  ref: string,
  title: string,
) {
  const { data: admins } = await admin
    .from("profiles")
    .select("line_user_id")
    .eq("role", "super_admin")
    .not("line_user_id", "is", null);
  if (!admins?.length) return;
  const base = process.env.APP_BASE_URL ?? "https://app.perpos.ai";
  const msg = `🐞 ปัญหาใหม่จาก LINE\n${ref} — ${title}\n${base}/admin/issues/${ref}`;
  await Promise.all(
    admins.map((a) =>
      sendLineMessages({
        to: a.line_user_id as string,
        messages: [{ type: "text", text: msg }],
      }).catch(() => {}),
    ),
  );
}

/**
 * ผู้ช่วยโฟล์ — ตอบคำถามสินค้า PERPOS/Flow/Suite (RAG) สำหรับ free text ที่เป็นคำถาม
 * ทุกคนที่แอด OA ใช้ได้ ไม่ต้องผูกบัญชี · rate-limit ต่อคน/วัน กัน abuse + คุมต้นทุน Gemini
 */
async function handleFlowChat(
  admin: ReturnType<typeof createAdminClient>,
  lineUserId: string,
  text: string,
  replyToken: string,
): Promise<void> {
  const { data: allowed } = await admin.rpc("incr_flow_chat_usage", {
    p_line_user_id: lineUserId,
    p_daily_limit: 30,
  });
  if (allowed === false) {
    await replyText(
      replyToken,
      "ขออภัยครับ วันนี้คุณถามผู้ช่วยโฟล์ครบจำนวนแล้ว 🙏 พรุ่งนี้ถามใหม่ได้เลย\nหรือสอบถามทีมงานที่ hello@perpos.ai",
    );
    return;
  }
  // ดึงชื่อ + ยอด token จาก profile (set ตอน provision) เพื่อทักด้วยชื่อจริง + บอกเครดิตคงเหลือ
  // — ไม่ยิง LINE API เพิ่ม (กัน latency inline)
  const { data: prof } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  const profileId = (prof as { id?: string } | null)?.id ?? null;
  const tokenBalance = profileId ? await getTokenBalance(admin, profileId) : null;
  const answer = await answerFlowQuestion(admin, text, {
    displayName: prof?.display_name ?? null,
    tokenBalance,
  });
  await replyText(replyToken, answer);
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function handleLink(
  admin: ReturnType<typeof createAdminClient>,
  lineUserId: string,
  token: string,
  replyToken: string,
) {
  const now = new Date().toISOString();
  const { data: row } = await admin
    .from("line_link_tokens")
    .select("profile_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (!row) return replyText(replyToken, "❌ Token ไม่ถูกต้อง");
  if (row.used_at) return replyText(replyToken, "❌ Token นี้ถูกใช้แล้ว");
  if (new Date(row.expires_at) < new Date()) return replyText(replyToken, "❌ Token หมดอายุแล้ว");

  await admin.from("profiles").update({ line_user_id: lineUserId }).eq("id", row.profile_id);
  await admin.from("line_link_tokens").update({ used_at: now }).eq("token", token);
  return replyText(replyToken, "✅ ผูกบัญชี LINE สำเร็จแล้ว!");
}

async function handleJaquarStock(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  args: string[],
  replyToken: string,
) {
  const search = args.join(" ").trim();
  if (!search) {
    return replyText(
      replyToken,
      `📌 รูปแบบ: /jq <รหัสสินค้า หรือ คำค้นหา>\n` + `ตัวอย่าง: /jq JQ-101`,
    );
  }

  // ค้นหาสินค้าจาก jaquar_inventory_items
  const { data: items, error } = await admin
    .from("jaquar_inventory_items")
    .select("item_code, description, location, total_saleable")
    .eq("org_id", orgId)
    .or(`item_code.ilike.%${search}%,description.ilike.%${search}%`)
    .order("item_code", { ascending: true })
    .limit(50);

  if (error) {
    return replyText(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูล: ${error.message}`);
  }

  if (!items || items.length === 0) {
    return replyText(replyToken, `❌ ไม่พบสินค้าสำหรับคำค้นหา "${search}"`);
  }

  // กรณีพบ 1 รายการ
  if (items.length === 1) {
    const item = items[0];
    const qty = Number(item.total_saleable || 0);

    let qtyColor = "#46BC9E"; // เขียว (in_stock)
    let qtyStatusText = "🟢 สต๊อกพร้อมขาย";
    if (qty === 0) {
      qtyColor = "#C43448"; // แดง (out_of_stock)
      qtyStatusText = "🔴 สินค้าหมด";
    } else if (qty < 5) {
      qtyColor = "#E6BB51"; // ส้ม (low_stock)
      qtyStatusText = "⚠️ สต๊อกใกล้หมด";
    }

    return replyLine(replyToken, [
      {
        type: "flex",
        altText: `ข้อมูลสินค้า ${item.item_code}`,
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            background: {
              type: "linearGradient",
              angle: "135deg",
              startColor: "#2A2A2C",
              endColor: "#3C3B3D",
            },
            contents: [
              {
                type: "text",
                text: "📦 ข้อมูลสินค้า / STOCK",
                weight: "bold",
                color: "#9CA3AF",
                size: "xs",
              },
              {
                type: "text",
                text: item.item_code,
                weight: "bold",
                size: "xl",
                color: "#FFFFFF",
                margin: "xs",
                wrap: true,
              },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            spacing: "md",
            contents: [
              {
                type: "box",
                layout: "vertical",
                spacing: "xs",
                contents: [
                  {
                    type: "text",
                    text: "รายละเอียด",
                    size: "xs",
                    color: "#656D78",
                  },
                  {
                    type: "text",
                    text: item.description || "ไม่มีรายละเอียด",
                    size: "sm",
                    color: "#2A2A2C",
                    wrap: true,
                  },
                ],
              },
              {
                type: "separator",
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: "📍 ที่เก็บสินค้า",
                    size: "sm",
                    color: "#656D78",
                    flex: 2,
                  },
                  {
                    type: "text",
                    text: item.location || "ไม่ระบุ",
                    size: "sm",
                    color: "#2A2A2C",
                    weight: "bold",
                    flex: 3,
                    align: "end",
                    wrap: true,
                  },
                ],
              },
              {
                type: "separator",
              },
              {
                type: "box",
                layout: "horizontal",
                alignItems: "center",
                contents: [
                  {
                    type: "text",
                    text: qtyStatusText,
                    size: "sm",
                    color: "#656D78",
                    flex: 2,
                  },
                  {
                    type: "text",
                    text: `${qty.toLocaleString("th-TH")} ชิ้น`,
                    size: "lg",
                    color: qtyColor,
                    weight: "bold",
                    flex: 3,
                    align: "end",
                  },
                ],
              },
            ],
          },
        },
      },
    ]);
  }

  // กรณีพบหลายรายการ
  const totalFound = items.length;
  const showLimit = 10;
  const listLines = items.slice(0, showLimit).map((item) => {
    const qty = Number(item.total_saleable || 0);
    const loc = item.location ? ` (ที่เก็บ: ${item.location})` : "";
    const desc = item.description ? ` - ${item.description}` : "";
    return `• ${item.item_code}${desc}: ${qty.toLocaleString("th-TH")} ชิ้น${loc}`;
  });

  let suffix = "";
  if (totalFound > showLimit) {
    suffix = `\n... และสินค้าอื่น ๆ อีก ${(totalFound - showLimit).toLocaleString("th-TH")} รายการ\n`;
  }

  return replyText(
    replyToken,
    `🔍 พบสินค้าที่ใกล้เคียง ${totalFound} รายการ:\n\n` +
      listLines.join("\n") +
      suffix +
      `\n💡 พิมพ์ /jq <รหัสสินค้า> ให้ระบุเจาะจงขึ้นเพื่อดูข้อมูล`,
  );
}

async function getProfileByLineId(admin: ReturnType<typeof createAdminClient>, lineUserId: string) {
  const { data } = await admin
    .from("profiles")
    .select("id, role, line_active_org_id, bot_consent_at")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  return data as {
    id: string;
    role: string;
    line_active_org_id: string | null;
    bot_consent_at: string | null;
  } | null;
}

type OrgInfo = { id: string; name: string; slug: string };

type OrgMembership = { organization_id: string; role: string; organizations: OrgInfo };

async function getUserOrgs(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<OrgMembership[]> {
  const { data } = await admin
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, slug)")
    .eq("user_id", profileId)
    .order("created_at");
  return (data ?? []) as unknown as OrgMembership[];
}

async function getOrSetActiveOrg(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  currentActiveOrgId: string | null,
): Promise<OrgInfo | null> {
  const orgs = await getUserOrgs(admin, profileId);
  if (!orgs.length) return null;

  if (currentActiveOrgId) {
    const current = orgs.find((m) => m.organization_id === currentActiveOrgId);
    if (current) return current.organizations;
  }

  // Auto-set to first org the user joined
  const first = orgs[0];
  await admin
    .from("profiles")
    .update({ line_active_org_id: first.organization_id })
    .eq("id", profileId);
  return first.organizations;
}

async function handleOrgCmd(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  args: string[],
  replyToken: string,
) {
  const orgs = await getUserOrgs(admin, profileId);
  if (!orgs.length) {
    return replyLine(replyToken, [
      {
        type: "flex",
        altText: "Organizations",
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            background: {
              type: "linearGradient",
              angle: "135deg",
              startColor: "#46839A",
              endColor: "#4FC1E9",
            },
            contents: [
              {
                type: "text",
                text: "🏢 ORGANIZATIONS",
                weight: "bold",
                color: "#FFFFFF",
                size: "sm",
              },
              {
                type: "text",
                text: "ยังไม่ได้เข้าร่วม Org",
                weight: "bold",
                size: "md",
                color: "#FFFFFF",
                margin: "xs",
                wrap: true,
              },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            spacing: "md",
            contents: [
              {
                type: "box",
                layout: "vertical",
                backgroundColor: "#FCF1F2",
                cornerRadius: "md",
                paddingAll: "12px",
                borderWidth: "1px",
                borderColor: "#F3C2C9",
                contents: [
                  {
                    type: "text",
                    text: "ติดต่อผู้ดูแลระบบเพื่อเชิญเข้า Organization",
                    color: "#C43448",
                    size: "sm",
                    wrap: true,
                  },
                ],
              },
            ],
          },
        },
      },
    ]);
  }

  if (!args[0]) {
    const orgRows = orgs.map((m, i) => ({
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "text",
          text: `${i + 1}. ${m.organizations.name}`,
          size: "sm",
          color: "#2A2A2C",
          flex: 1,
          wrap: true,
        },
      ],
    }));
    return replyLine(replyToken, [
      {
        type: "flex",
        altText: `Organizations (${orgs.length})`,
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            background: {
              type: "linearGradient",
              angle: "135deg",
              startColor: "#46839A",
              endColor: "#4FC1E9",
            },
            contents: [
              {
                type: "text",
                text: "🏢 ORGANIZATIONS",
                weight: "bold",
                color: "#FFFFFF",
                size: "sm",
              },
              {
                type: "text",
                text: `เลือก Org ที่ต้องการ`,
                weight: "bold",
                size: "md",
                color: "#FFFFFF",
                margin: "xs",
                wrap: true,
              },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            spacing: "md",
            contents: [
              ...orgRows,
              { type: "separator" },
              {
                type: "text",
                text: "พิมพ์ /org <N> เพื่อเปลี่ยน",
                size: "xs",
                color: "#656D78",
                wrap: true,
              },
            ],
          },
        },
      },
    ]);
  }

  const n = parseInt(args[0]);
  if (isNaN(n) || n < 1 || n > orgs.length) {
    return replyText(replyToken, `❌ หมายเลขไม่ถูกต้อง ต้องอยู่ระหว่าง 1-${orgs.length}`);
  }

  const selected = orgs[n - 1];
  await admin
    .from("profiles")
    .update({ line_active_org_id: selected.organization_id })
    .eq("id", profileId);
  return replyLine(replyToken, [
    {
      type: "flex",
      altText: `เปลี่ยน Org เป็น ${selected.organizations.name}`,
      contents: {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          paddingAll: "16px",
          background: {
            type: "linearGradient",
            angle: "135deg",
            startColor: "#46BC9E",
            endColor: "#79DCC3",
          },
          contents: [
            {
              type: "text",
              text: "✅ เปลี่ยน ORG แล้ว",
              weight: "bold",
              color: "#FFFFFF",
              size: "sm",
            },
            {
              type: "text",
              text: selected.organizations.name,
              weight: "bold",
              size: "md",
              color: "#FFFFFF",
              margin: "xs",
              wrap: true,
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          paddingAll: "16px",
          spacing: "md",
          contents: [
            {
              type: "box",
              layout: "vertical",
              backgroundColor: "#F2FCF9",
              cornerRadius: "md",
              paddingAll: "12px",
              borderWidth: "1px",
              borderColor: "#C8F1E6",
              contents: [
                {
                  type: "text",
                  text: `Org ที่ใช้งานอยู่ตอนนี้: ${selected.organizations.name}`,
                  color: "#44A38B",
                  size: "sm",
                  wrap: true,
                },
              ],
            },
          ],
        },
      },
    },
  ]);
}

async function checkPermission(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  key: string,
  role: string,
): Promise<boolean> {
  if (role === "super_admin") return true;
  const { data } = await admin
    .from("user_permissions")
    .select("allowed")
    .eq("user_id", profileId)
    .eq("function_key", key)
    .maybeSingle();
  return Boolean((data as Record<string, unknown> | null)?.allowed);
}

/** ตรวจ personal_module_grants — คืน true ถ้า user ได้รับสิทธิ์ personal module นั้น */
async function checkPersonalGrant(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  moduleKey: string,
): Promise<boolean> {
  const { data } = await admin
    .from("personal_module_grants")
    .select("is_enabled")
    .eq("user_id", profileId)
    .eq("module_key", moduleKey)
    .eq("is_enabled", true)
    .maybeSingle();
  return data !== null;
}

/** ตรวจสิทธิ์ assistant — ผ่านถ้า super_admin หรือมี user_permission หรือมี personal_module_grant */
// สิทธิ์ผู้ช่วย AI / แกะเสียง (/mom) — per-profile, key ภายในยังเป็น 'stt'
// grant ให้ตั้งแต่ onboarding (พร้อม trial 300 นาที) → ด่านเก็บเงินจริงคือ quota ที่ stt-worker
async function checkSttAccess(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  role: string,
): Promise<boolean> {
  const { data: prof } = await admin
    .from("profiles")
    .select("is_active")
    .eq("id", profileId)
    .maybeSingle();
  if ((prof as { is_active?: boolean } | null)?.is_active === false) return false;
  if (role === "super_admin") return true;
  const [perm, grant] = await Promise.all([
    checkPermission(admin, profileId, "bot.assistant.transcribe", role),
    checkPersonalGrant(admin, profileId, "stt"),
  ]);
  return perm || grant;
}

// สิทธิ์บีบ PDF (/pdf) — per-profile kind 'pdf_compress' (grant ให้ตั้งแต่ onboarding + trial 20 หน้า)
async function checkPdfAccess(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  role: string,
): Promise<boolean> {
  const { data: prof } = await admin
    .from("profiles")
    .select("is_active")
    .eq("id", profileId)
    .maybeSingle();
  if ((prof as { is_active?: boolean } | null)?.is_active === false) return false;
  if (role === "super_admin") return true;
  return checkPersonalGrant(admin, profileId, "pdf_compress");
}

// ─── /mom — รับไฟล์เสียงจาก LINE → STT → ส่ง PDF MoM กลับ ──────────────────────
const STT_ALLOWED_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/flac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const EXT_TO_MIME: Record<string, string> = {
  ogg: "audio/ogg",
  opus: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  aac: "audio/aac",
  flac: "audio/flac",
  mp4: "video/mp4",
  webm: "audio/webm",
};
const MIME_TO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/webm": "webm",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** normalize content-type ของ LINE ให้เป็น mime ที่ bucket อนุญาต (LINE เสียง = m4a/audio/x-m4a) */
function normalizeAudioMime(rawMime: string, fileName: string): { mime: string; ext: string } {
  let mime = (rawMime || "").split(";")[0].trim().toLowerCase();
  if (!STT_ALLOWED_MIME.has(mime)) {
    const ext = (fileName.split(".").pop() ?? "").toLowerCase();
    mime = EXT_TO_MIME[ext] ?? "audio/mp4";
  }
  return { mime, ext: MIME_TO_EXT[mime] ?? "m4a" };
}

// webhook ต้องตอบ LINE เร็ว → **ไม่โหลดไฟล์ที่นี่** (ไฟล์ประชุมใหญ่จะ timeout + LINE retry).
// แค่ INSERT job เก็บ line_message_id แล้วให้ stt-worker (Cloud Run) โหลดจาก LINE เองทีหลัง.
async function handleMomAudio(
  admin: ReturnType<typeof createAdminClient>,
  lineUserId: string,
  messageId: string,
  profileId: string,
  orgId: string,
  fileNameHint: string,
  replyToken: string,
) {
  // กันผู้ใช้ที่ถูกระงับ (is_active=false) — path "audio ที่มี session ค้าง" เรียกตรงไม่ผ่าน checkSttAccess
  const { data: prof } = await admin
    .from("profiles")
    .select("is_active")
    .eq("id", profileId)
    .maybeSingle();
  if ((prof as { is_active?: boolean } | null)?.is_active === false) {
    await admin
      .from("assistant_line_sessions")
      .delete()
      .eq("line_user_id", lineUserId)
      .then(
        () => undefined,
        () => undefined,
      );
    await replyText(replyToken, "❌ บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
    return;
  }

  const { ext } = normalizeAudioMime("", fileNameHint);
  const fileName = fileNameHint || `line-เสียง-${Date.now()}.${ext}`;

  // ตอบ LINE ให้เร็วที่สุด → insert งานเลย (ไม่ lookup email; profile_id พอสำหรับ audit)
  const { data: job, error: jobErr } = await admin
    .from("assistant_jobs")
    .insert({
      org_id: orgId,
      profile_id: profileId,
      audio_url: null,
      line_message_id: messageId,
      file_name: fileName,
      mime_type: "audio/mp4",
      model: "gemini-2.5-flash",
      source: "line",
      triggered_by: profileId,
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    // unique violation (23505) = LINE ส่ง event เดิมซ้ำ → งานถูกคิวไว้แล้ว เงียบได้
    if ((jobErr as { code?: string } | null)?.code === "23505") return;
    await replyText(replyToken, `❌ สร้างงานถอดเสียงไม่สำเร็จ: ${jobErr?.message ?? ""}`);
    return;
  }

  // ใช้ session แล้ว — ลบทิ้ง (กันส่งไฟล์ซ้ำเข้าคิวเดิม)
  await admin.from("assistant_line_sessions").delete().eq("line_user_id", lineUserId);

  // ตอบรับ "ทันที" ด้วย replyToken (อายุสั้น) — ต้องทำ **ก่อน** trigger worker
  // ซึ่ง await การตอบจาก Cloud Run ที่อาจช้า 2–5 วิจาก cold start
  await replyLine(replyToken, [
    {
      type: "flex",
      altText: "ได้รับไฟล์แล้ว — กำลังจัดทำรายงานการประชุม",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          paddingAll: "20px",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              spacing: "sm",
              alignItems: "center",
              contents: [
                { type: "text", text: "✅", size: "lg", flex: 0 },
                {
                  type: "text",
                  text: "รับไฟล์เรียบร้อย",
                  weight: "bold",
                  size: "md",
                  color: "#4DB0D3",
                  gravity: "center",
                },
              ],
            },
            { type: "separator", margin: "md" },
            {
              type: "text",
              text: "ระบบกำลังถอดเสียงและจัดทำรายงานการประชุม (Minutes of Meeting)",
              size: "sm",
              wrap: true,
              color: "#3C3B3D",
              margin: "md",
            },
            {
              type: "text",
              text: "เสร็จแล้วจะส่งไฟล์ PDF กลับมาให้อัตโนมัติ ไม่ต้องส่งซ้ำ",
              size: "xs",
              wrap: true,
              color: "#9CA3AF",
            },
          ],
        },
      },
    },
  ]);

  // จากนั้นค่อยสั่ง worker — ถ้าล้มเหลว push แจ้ง (reply token ใช้ไปแล้ว ตอบซ้ำไม่ได้)
  const trig = await triggerSttWorker(admin, job.id as string, orgId);
  if (!trig.ok) {
    // คิวเต็มชั่วคราว (queued) → งานไม่ถูกทิ้ง รอ scheduler ยิงซ้ำ → บอกให้รอ
    // error จริง → ให้ลองใหม่
    const text = trig.queued
      ? "⏳ ขณะนี้มีงานเข้ามาจำนวนมาก งานของคุณเข้าคิวเรียบร้อยแล้ว ระบบจะถอดเสียงให้อัตโนมัติเมื่อถึงคิว รอสักครู่นะครับ 🙏"
      : "❌ ขออภัย เริ่มถอดเสียงไม่สำเร็จ กรุณาพิมพ์ /mom แล้วส่งไฟล์อีกครั้ง";
    await sendLineMessages({
      to: lineUserId,
      messages: [{ type: "text", text }],
    }).catch(() => undefined);
  }
}

// ─── /pdf — รับไฟล์ PDF จาก LINE → บีบ → ส่งไฟล์เล็กกลับ (P1c: auto, ยังไม่มี confirm/quota) ──
// webhook ไม่โหลดไฟล์เอง (กัน timeout) — INSERT job เก็บ line_message_id แล้วให้ pdf-worker โหลดเอง
async function handlePdfFile(
  admin: ReturnType<typeof createAdminClient>,
  lineUserId: string,
  messageId: string,
  profileId: string,
  orgId: string,
  fileNameHint: string,
  replyToken: string,
) {
  const { data: prof } = await admin
    .from("profiles")
    .select("is_active")
    .eq("id", profileId)
    .maybeSingle();
  if ((prof as { is_active?: boolean } | null)?.is_active === false) {
    await admin
      .from("assistant_line_sessions")
      .delete()
      .eq("line_user_id", lineUserId)
      .then(
        () => undefined,
        () => undefined,
      );
    await replyText(replyToken, "❌ บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
    return;
  }

  const fileName = fileNameHint || `document-${Date.now()}.pdf`;
  const { data: job, error: jobErr } = await admin
    .from("assistant_jobs")
    .insert({
      org_id: orgId,
      profile_id: profileId,
      kind: "pdf_compress",
      source: "line",
      line_message_id: messageId,
      file_name: fileName,
      mime_type: "application/pdf",
      triggered_by: profileId,
    })
    .select("id")
    .single();
  if (jobErr || !job) {
    if ((jobErr as { code?: string } | null)?.code === "23505") return; // LINE ส่ง event ซ้ำ
    await replyText(replyToken, `❌ สร้างงานบีบ PDF ไม่สำเร็จ: ${jobErr?.message ?? ""}`);
    return;
  }

  await admin.from("assistant_line_sessions").delete().eq("line_user_id", lineUserId);

  await replyLine(replyToken, [
    {
      type: "flex",
      altText: "ได้รับไฟล์ PDF แล้ว — กำลังบีบขนาด",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          paddingAll: "20px",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              spacing: "sm",
              alignItems: "center",
              contents: [
                { type: "text", text: "✅", size: "lg", flex: 0 },
                {
                  type: "text",
                  text: "รับไฟล์เรียบร้อย",
                  weight: "bold",
                  size: "md",
                  color: "#3C3B3D",
                  gravity: "center",
                },
              ],
            },
            { type: "separator", margin: "md" },
            {
              type: "text",
              text: "ระบบกำลังบีบขนาดไฟล์ PDF โดยคงความชัด",
              size: "sm",
              wrap: true,
              color: "#3C3B3D",
              margin: "md",
            },
            {
              type: "text",
              text: "เสร็จแล้วจะส่งไฟล์กลับมาให้อัตโนมัติ ไม่ต้องส่งซ้ำ",
              size: "xs",
              wrap: true,
              color: "#9CA3AF",
            },
          ],
        },
      },
    },
  ]);

  const trig = await triggerPdfWorker(admin, job.id as string, orgId);
  if (!trig.ok) {
    const text = trig.queued
      ? "⏳ ขณะนี้มีงานเข้ามาจำนวนมาก งานของคุณเข้าคิวแล้ว ระบบจะบีบให้อัตโนมัติเมื่อถึงคิว รอสักครู่นะครับ 🙏"
      : "❌ ขออภัย เริ่มบีบไฟล์ไม่สำเร็จ กรุณาพิมพ์ /pdf แล้วส่งไฟล์อีกครั้ง";
    await sendLineMessages({ to: lineUserId, messages: [{ type: "text", text }] }).catch(
      () => undefined,
    );
  }
}

// ผู้ใช้กดปุ่ม "ถอดเสียงเลย" จาก Flex (กรณีส่งไฟล์มาก่อนพิมพ์ /mom) → ตรวจสิทธิ์+org+โควต้า
// แล้วเริ่มถอดเสียงจาก messageId นั้น (handleMomAudio idempotent ต่อ line_message_id → กดซ้ำไม่สร้างงานซ้ำ)
async function handleMomConfirm(
  admin: ReturnType<typeof createAdminClient>,
  lineUserId: string,
  messageId: string,
  replyToken: string,
) {
  if (!messageId) return;
  const profile = await getProfileByLineId(admin, lineUserId);
  if (!profile) {
    await replyText(replyToken, "❌ กรุณาแอด LINE และเริ่มต้นใช้งานก่อนครับ");
    return;
  }
  if (!(await checkSttAccess(admin, profile.id, profile.role))) {
    await replyText(replyToken, "❌ ไม่มีสิทธิ์ถอดเสียง (ต้องเปิดใช้งานฟีเจอร์แกะเสียงก่อน)");
    return;
  }
  const activeOrg = await getOrSetActiveOrg(admin, profile.id, profile.line_active_org_id);
  if (!activeOrg) {
    await replyText(replyToken, "❌ ยังไม่ได้เลือกองค์กร พิมพ์ /org เพื่อเลือกองค์กรก่อน");
    return;
  }

  const { remainUnits: qRemain } = await getServiceRemaining(admin, profile.id, "stt");
  if (qRemain <= 0) {
    await replyText(replyToken, "❌ เครดิตของคุณหมดแล้ว\nพิมพ์ /web เพื่อเติมเครดิตครับ");
    return;
  }

  await handleMomAudio(admin, lineUserId, messageId, profile.id, activeOrg.id, "", replyToken);
}

// ผู้ใช้กดปุ่ม "บีบขนาดเลย" จาก Flex (โยน PDF มาแล้วยืนยัน) → ตรวจสิทธิ์+org แล้วเริ่มบีบ
// handlePdfFile idempotent ต่อ line_message_id → กดซ้ำไม่สร้างงานซ้ำ
async function handlePdfConfirm(
  admin: ReturnType<typeof createAdminClient>,
  lineUserId: string,
  messageId: string,
  fileName: string,
  replyToken: string,
) {
  if (!messageId) return;
  const profile = await getProfileByLineId(admin, lineUserId);
  if (!profile) {
    await replyText(replyToken, "❌ กรุณาแอด LINE และเริ่มต้นใช้งานก่อนครับ");
    return;
  }
  if (!(await checkPdfAccess(admin, profile.id, profile.role))) {
    await replyText(replyToken, "❌ ไม่มีสิทธิ์ใช้ฟีเจอร์บีบ PDF");
    return;
  }
  const activeOrg = await getOrSetActiveOrg(admin, profile.id, profile.line_active_org_id);
  if (!activeOrg) {
    await replyText(replyToken, "❌ ยังไม่ได้เลือกองค์กร พิมพ์ /org เพื่อเลือกองค์กรก่อน");
    return;
  }
  // ส่งชื่อไฟล์เดิม (จาก postback) → ใช้เป็นชื่อ output แทน document-<ts>
  await handlePdfFile(admin, lineUserId, messageId, profile.id, activeOrg.id, fileName, replyToken);
}

// ผู้ใช้กดปุ่ม "บีบแบบเข้ม" จาก Flex ผลลัพธ์ pass 1 (vector-heavy, บีบปกติได้น้อย)
//   → สร้าง job rasterize (pass 2) อ้างไฟล์ pass 1 ใน bucket เป็น source แล้ว trigger worker
async function handlePdfRasterConfirm(
  admin: ReturnType<typeof createAdminClient>,
  lineUserId: string,
  parentJobId: string,
  replyToken: string,
) {
  if (!parentJobId) return;
  const profile = await getProfileByLineId(admin, lineUserId);
  if (!profile) {
    await replyText(replyToken, "❌ กรุณาแอด LINE และเริ่มต้นใช้งานก่อนครับ");
    return;
  }
  if (!(await checkPdfAccess(admin, profile.id, profile.role))) {
    await replyText(replyToken, "❌ ไม่มีสิทธิ์ใช้ฟีเจอร์บีบ PDF");
    return;
  }

  // โหลด job ต้นทาง (pass 1) — ต้องเป็นของผู้ใช้คนนี้ + completed + มีไฟล์ผลลัพธ์ใน bucket
  const { data: parent } = await admin
    .from("assistant_jobs")
    .select("id, org_id, profile_id, file_name, status, pdf_meta")
    .eq("id", parentJobId)
    .eq("profile_id", profile.id)
    .eq("kind", "pdf_compress")
    .maybeSingle();
  const pmeta = (parent?.pdf_meta ?? {}) as {
    output_path?: string;
    orig_path?: string;
    mode?: string;
    raster_child_id?: string;
  };
  if (!parent || parent.status !== "completed" || !pmeta.output_path) {
    await replyText(
      replyToken,
      "❌ ไม่พบไฟล์ต้นทาง อาจถูกลบแล้ว (เก็บไว้ 48 ชม.) กรุณาส่งไฟล์ใหม่อีกครั้ง",
    );
    return;
  }
  // rasterize ต้องบีบจาก "ต้นฉบับเดิม" (orig_path เก็บไว้ตอน pass 1) ไม่ใช่ output pass 1
  //   กัน double JPEG รูปในไฟล์ · fallback output_path ถ้าไม่มี (งานเก่า/persist ล้ม)
  const rasterSrcPath = pmeta.orig_path || pmeta.output_path;
  if (pmeta.mode === "rasterize") {
    await replyText(replyToken, "ไฟล์นี้บีบแบบเข้มไปแล้วครับ 🙏");
    return;
  }
  // กดซ้ำ → มี job rasterize ค้างอยู่แล้ว
  if (pmeta.raster_child_id) {
    await replyText(replyToken, "⚡ กำลังบีบแบบเข้มให้อยู่แล้ว รอสักครู่นะครับ");
    return;
  }

  // เครดิตต้องพอ (โหมดเข้มคิดตามจำนวนหน้าเสมอ)
  const { remainUnits } = await getServiceRemaining(admin, profile.id, "pdf");
  if (remainUnits <= 0) {
    await replyText(replyToken, "❌ เครดิตของคุณหมดแล้ว\nพิมพ์ /web เพื่อเติมเครดิตครับ");
    return;
  }

  const orgId = String(parent.org_id);
  const { data: child, error: childErr } = await admin
    .from("assistant_jobs")
    .insert({
      org_id: orgId,
      profile_id: profile.id,
      kind: "pdf_compress",
      source: "line",
      file_name: String(parent.file_name ?? "document.pdf"),
      mime_type: "application/pdf",
      triggered_by: profile.id,
      pdf_meta: { mode: "rasterize", src_path: rasterSrcPath, parent_job_id: parentJobId },
    })
    .select("id")
    .single();
  if (childErr || !child) {
    await replyText(replyToken, `❌ เริ่มบีบแบบเข้มไม่สำเร็จ: ${childErr?.message ?? ""}`);
    return;
  }

  // ผูก child id กลับ parent → กันกดซ้ำสร้างงานซ้ำ
  await admin
    .from("assistant_jobs")
    .update({ pdf_meta: { ...pmeta, raster_child_id: child.id } })
    .eq("id", parentJobId)
    .then(
      () => undefined,
      () => undefined,
    );

  await replyText(
    replyToken,
    "⚡ กำลังบีบแบบเข้ม (แปลงหน้าเป็นรูปภาพ) — เสร็จแล้วจะส่งไฟล์กลับมาให้อัตโนมัติครับ",
  );

  const trig = await triggerPdfWorker(admin, child.id as string, orgId);
  if (!trig.ok) {
    const text = trig.queued
      ? "⏳ ขณะนี้มีงานเข้ามาจำนวนมาก งานของคุณเข้าคิวแล้ว ระบบจะบีบให้อัตโนมัติเมื่อถึงคิว รอสักครู่นะครับ 🙏"
      : "❌ ขออภัย เริ่มบีบแบบเข้มไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
    await sendLineMessages({ to: lineUserId, messages: [{ type: "text", text }] }).catch(
      () => undefined,
    );
  }
}

// การ์ดอธิบาย 1 ฟีเจอร์ (ใช้ใน carousel ต่อท้าย welcome) — header charcoal flat + accent Flow green
function buildFeatureBubble(opts: {
  icon: string;
  title: string;
  tagline: string;
  points: string[];
  hint: string;
}) {
  return {
    type: "bubble" as const,
    size: "kilo" as const,
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#3C3B3D",
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: `${opts.icon} ${opts.title}`,
          color: "#ffffff",
          weight: "bold",
          size: "md",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "md",
      contents: [
        { type: "text", text: opts.tagline, size: "sm", color: "#525866", wrap: true },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          margin: "md",
          contents: opts.points.map((p) => ({
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              { type: "text", text: "•", size: "sm", color: "#48CFAD", flex: 0 },
              { type: "text", text: p, size: "sm", color: "#656D78", wrap: true },
            ],
          })),
        },
        // filler ดูดช่องว่าง → ดันกรอบ hint ลงไปชิดด้านล่าง (carousel ยืด body ทุกใบสูงเท่าใบสูงสุด)
        { type: "filler" },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#E4F8F3",
          cornerRadius: "10px",
          paddingAll: "12px",
          margin: "md",
          contents: [
            {
              type: "text",
              text: opts.hint,
              size: "xs",
              weight: "bold",
              color: "#44A38B",
              align: "center",
              wrap: true,
            },
          ],
        },
      ],
    },
  };
}

// carousel 3 ฟีเจอร์ (ถอดเสียง · บอทประชุม · บีบ PDF) — เลื่อนทางขวา ส่งต่อท้าย welcome
function buildFeaturesCarousel() {
  return {
    type: "flex" as const,
    altText: "ฟีเจอร์ผู้ช่วย Flow — 🎙️ ถอดเสียงประชุม · 🤖 บอทเข้าประชุม · 📑 บีบ PDF",
    contents: {
      type: "carousel" as const,
      contents: [
        buildFeatureBubble({
          icon: "🎙️",
          title: "ถอดเสียงประชุม",
          tagline: "อัปไฟล์เสียง/วิดีโอ แล้วได้รายงานการประชุม (MoM) เป็น PDF",
          points: [
            "สรุปหัวข้อ · มติที่ประชุม · งานที่ต้องทำ · ผู้เข้าร่วม",
            "รองรับไทย/อังกฤษ และไฟล์ยาวหลายชั่วโมง",
            "ไฟล์เสียงถูกลบทันทีหลังสรุปเสร็จ (PDPA)",
          ],
          hint: "📎 ส่งไฟล์เสียง/วิดีโอ หรือพิมพ์ /mom",
        }),
        buildFeatureBubble({
          icon: "🤖",
          title: "บอทเข้าประชุม",
          tagline: "วางลิงก์ Zoom / Google Meet / Teams แล้วบอทเข้าไปอัดและสรุปให้",
          points: [
            "บอทเข้าห้องแทนคุณ ไม่ต้องนั่งอัดเอง",
            "จบประชุม → ส่ง MoM PDF กลับทาง LINE",
            "เหมาะกับประชุมที่เข้าร่วมไม่ได้/อยากโฟกัสคุย",
          ],
          hint: "🔗 วางลิงก์ห้องประชุมในแชตนี้ได้เลย",
        }),
        buildFeatureBubble({
          icon: "📑",
          title: "บีบขนาด PDF",
          tagline: "ส่งไฟล์ PDF แล้วบีบให้เล็กลง ส่งต่อง่าย อัปโหลดไว",
          points: [
            "ลดขนาดให้อัตโนมัติ คงความคมชัดของเอกสาร",
            "ถ้าบีบปกติไม่ลง มีโหมดบีบแบบเข้ม (rasterize)",
            "คงชื่อไฟล์เดิม ส่งกลับทาง LINE",
          ],
          hint: "📎 โยนไฟล์ PDF เข้ามาได้เลย",
        }),
      ],
    },
  };
}

// auto-onboarding เมื่อมี follow event → provision + welcome Flex (การ์ดต้อนรับสวย ๆ)
async function handleFollow(admin: ReturnType<typeof createAdminClient>, lineUserId: string) {
  const result = await provisionLineUser(admin, lineUserId);
  const name = result.displayName;
  const greeting = result.isNew ? `ยินดีต้อนรับ คุณ${name} 🎉` : `ยินดีต้อนรับกลับมา คุณ${name} 🙌`;

  // เครดิต = ยอด token คงเหลือ (unified pool) — แสดงเป็น token ตรง ๆ
  const balance = await getTokenBalance(admin, result.profileId);
  const tokenText = `${balance.toLocaleString("th-TH")} token`;
  const giftLabel = result.isNew ? "เครดิตฟรีสำหรับคุณ" : "เครดิตคงเหลือ";

  const steps: Array<[string, string]> = [
    ["1", "ส่งไฟล์เสียง หรือ PDF เข้ามาได้เลย — หรือวางลิงก์ประชุม Zoom/Meet"],
    ["2", "ระบบถามยืนยัน แล้วถอดเสียง/บีบไฟล์ให้อัตโนมัติ"],
    ["3", "รับรายงานการประชุม (PDF) หรือไฟล์ที่บีบแล้ว กลับทาง LINE"],
  ];
  const stepBoxes = steps.map(([n, txt]) => ({
    type: "box",
    layout: "horizontal",
    spacing: "md",
    alignItems: "center",
    margin: "md",
    contents: [
      {
        type: "box",
        layout: "vertical",
        width: "26px",
        height: "26px",
        backgroundColor: "#E4F8F3",
        cornerRadius: "13px",
        justifyContent: "center",
        flex: 0,
        contents: [
          { type: "text", text: n, size: "sm", weight: "bold", color: "#44A38B", align: "center" },
        ],
      },
      { type: "text", text: txt, size: "sm", color: "#525866", wrap: true, gravity: "center" },
    ],
  }));

  await sendLineMessages({
    to: lineUserId,
    messages: [
      {
        type: "flex",
        altText: `ยินดีต้อนรับสู่ PERPOS Assistant — เครดิตฟรี ${tokenText}`,
        contents: {
          type: "bubble",
          size: "mega",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#3C3B3D",
            paddingAll: "20px",
            paddingBottom: "16px",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "PERPOS",
                    color: "#ffffff",
                    weight: "bold",
                    size: "xl",
                    flex: 0,
                  },
                  { type: "text", text: "|", color: "#9CA3AF", size: "xl", flex: 0 },
                  {
                    type: "text",
                    text: "Flow",
                    color: "#79DCC3",
                    weight: "bold",
                    size: "xl",
                    flex: 0,
                  },
                ],
              },
              {
                type: "text",
                text: "ผู้ช่วย AI ส่วนตัวบน LINE",
                color: "#CCD1D9",
                size: "xs",
                wrap: true,
              },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "md",
            paddingAll: "20px",
            contents: [
              {
                type: "text",
                text: greeting,
                weight: "bold",
                size: "md",
                color: "#2A2A2C",
                wrap: true,
              },
              {
                type: "box",
                layout: "horizontal",
                backgroundColor: "#F2FCF9",
                cornerRadius: "12px",
                paddingAll: "14px",
                spacing: "md",
                alignItems: "center",
                contents: [
                  { type: "text", text: "🎁", size: "xxl", flex: 0, gravity: "center" },
                  {
                    type: "box",
                    layout: "vertical",
                    spacing: "xs",
                    contents: [
                      { type: "text", text: giftLabel, size: "xs", color: "#44A38B" },
                      {
                        type: "text",
                        text: tokenText,
                        weight: "bold",
                        size: "xl",
                        color: "#428B79",
                      },
                    ],
                  },
                ],
              },
              { type: "separator", margin: "lg" },
              {
                type: "text",
                text: "ใช้งานง่าย 3 ขั้นตอน",
                weight: "bold",
                size: "sm",
                color: "#3C3B3D",
                margin: "lg",
              },
              ...stepBoxes,
              { type: "separator", margin: "lg" },
              {
                type: "text",
                text: "💬 หรือพิมพ์ถามผู้ช่วยโฟล์ได้เลย เช่น “Flow คืออะไร” · “ราคาเท่าไหร่”",
                size: "xs",
                color: "#656D78",
                wrap: true,
                margin: "lg",
              },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            paddingAll: "16px",
            paddingTop: "8px",
            contents: [
              {
                type: "box",
                layout: "vertical",
                backgroundColor: "#F5F7FA",
                cornerRadius: "10px",
                paddingAll: "14px",
                contents: [
                  {
                    type: "text",
                    text: "📎 โยนไฟล์เข้ามาในแชตนี้ได้เลย",
                    size: "sm",
                    weight: "bold",
                    color: "#3C3B3D",
                    align: "center",
                    wrap: true,
                  },
                  {
                    type: "text",
                    text: "ไฟล์เสียง · วิดีโอ · PDF หรือวางลิงก์ประชุม",
                    size: "xs",
                    color: "#656D78",
                    align: "center",
                    wrap: true,
                    margin: "xs",
                  },
                ],
              },
              {
                type: "text",
                text: "รองรับไฟล์เสียง/วิดีโอ ได้สูงสุด 500MB",
                size: "xxs",
                color: "#9ca3af",
                align: "center",
              },
            ],
          },
        },
      },
      buildFeaturesCarousel(),
    ],
  }).catch(() => undefined);
}

// ─── Main webhook handler ─────────────────────────────────────────────────────

const TMC_CMDS = [
  "รับ",
  "จ่าย",
  "บัญชี",
  "stock",
  "stkin",
  "stkout",
  "stk",
  "เช็คอิน",
  "pcin",
  "pcout",
  "pcbal",
  "pcfunds",
  "tmc",
];
const CRM_CMDS = [
  "n",
  "survey",
  "issue",
  "mtg",
  "log",
  "sol",
  "status",
  "notes",
  "issues",
  "hours",
];

// ─── Meeting bot (Recall.ai) — วางลิงก์ประชุมใน LINE → บอทเข้าห้องอัด → MoM ────────
// constants/helpers ส่วนกลาง (getBotRemaining, reconcile, dispatch) อยู่ที่ lib/assistant/recall-bot.ts
const PLATFORM_LABEL: Record<string, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
};

/** PDPA §8 — การ์ดยินยอมครั้งแรกก่อนใช้บอทประชุม (เด้งเมื่อ profile.bot_consent_at = null) */
function buildBotConsentFlex() {
  return {
    type: "flex" as const,
    altText: "🔒 ก่อนเริ่มใช้บอทประชุม — โปรดอ่านและยอมรับเงื่อนไข",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "horizontal",
        backgroundColor: "#3C3B3D",
        paddingAll: "14px",
        contents: [
          {
            type: "text",
            text: "🔒 ก่อนเริ่มใช้บอทประชุม",
            color: "#ffffff",
            weight: "bold",
            size: "md",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "18px",
        contents: [
          {
            type: "text",
            text: 'บอท "PERPOS Assistant (AI Note-taker)" จะเข้าร่วมประชุมและบันทึกเสียงของผู้เข้าร่วมทุกคนเพื่อสรุปรายงานการประชุม',
            size: "sm",
            wrap: true,
            color: "#1A1A1B",
          },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#E6F1FB",
            cornerRadius: "8px",
            paddingAll: "10px",
            margin: "sm",
            contents: [
              {
                type: "text",
                text: "เมื่อกดยอมรับ ถือว่าคุณยืนยันว่า:",
                size: "xs",
                color: "#0C447C",
                weight: "bold",
                wrap: true,
              },
              {
                type: "text",
                text: "• คุณรับผิดชอบการแจ้งและขอความยินยอมจากผู้เข้าร่วมในห้องตาม PDPA",
                size: "xs",
                color: "#0C447C",
                wrap: true,
                margin: "sm",
              },
              {
                type: "text",
                text: "• ไฟล์เสียงจะถูกลบทันทีหลังสรุปเสร็จ และเก็บเฉพาะรายงานชั่วคราว",
                size: "xs",
                color: "#0C447C",
                wrap: true,
                margin: "sm",
              },
            ],
          },
          {
            type: "text",
            text: "หากไม่ต้องการให้บอทบันทึก เพียงไม่วางลิงก์ประชุมก็พอครับ",
            size: "xxs",
            wrap: true,
            color: "#9CA3AF",
            margin: "md",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: "#3C3B3D",
            action: {
              type: "postback",
              label: "✓ ยอมรับและเริ่มใช้งาน",
              data: "botconsent",
              displayText: "ยอมรับเงื่อนไขบอทประชุม",
            },
          },
        ],
      },
    },
  };
}

/** ผู้ใช้กดยอมรับเงื่อนไข (postback botconsent) → บันทึก bot_consent_at + ชวนวางลิงก์ */
async function handleRecallConsent(
  admin: ReturnType<typeof createAdminClient>,
  lineUserId: string,
  replyToken: string,
): Promise<void> {
  const profile = await getProfileByLineId(admin, lineUserId);
  if (!profile) return;
  if (!profile.bot_consent_at) {
    await admin
      .from("profiles")
      .update({ bot_consent_at: new Date().toISOString() })
      .eq("id", profile.id);
  }
  await replyText(
    replyToken,
    "✅ บันทึกการยอมรับแล้ว — วางลิงก์ประชุม (Google Meet / Zoom / Teams) อีกครั้งเพื่อให้บอทเข้าห้องได้เลยครับ",
  );
}

function buildLinkConfirmFlex(
  platformLabel: string,
  maxMin: number,
  jobId: string,
  joinAtText?: string,
) {
  const statusText = joinAtText ? `📅 นัดเข้าห้อง ${joinAtText} น.` : "⏳ บอทกำลังเข้าห้องประชุม…";
  return {
    type: "flex" as const,
    altText: joinAtText
      ? `🤖 นัดบอทเข้าประชุม ${joinAtText}`
      : "🤖 ได้รับลิงก์ประชุมแล้ว — บอทกำลังเข้าห้อง",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "horizontal",
        backgroundColor: "#3C3B3D",
        paddingAll: "14px",
        contents: [
          {
            type: "text",
            text: joinAtText ? "🤖 นัดบอทเข้าประชุมแล้ว" : "🤖 ได้รับลิงก์ประชุมแล้ว",
            color: "#ffffff",
            weight: "bold",
            size: "md",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "18px",
        contents: [
          { type: "text", text: `📹 ${platformLabel}`, size: "sm", color: "#1A1A1B" },
          {
            type: "box",
            layout: "horizontal",
            backgroundColor: "#E6F1FB",
            cornerRadius: "8px",
            paddingAll: "10px",
            margin: "sm",
            contents: [
              { type: "text", text: statusText, size: "sm", color: "#0C447C", wrap: true },
            ],
          },
          {
            type: "text",
            text: 'บอทจะปรากฏในห้องชื่อ "PERPOS Assistant (AI Note-taker)" · เมื่อประชุมจบจะส่งรายงานการประชุม (MoM) กลับมาที่นี่',
            size: "xs",
            wrap: true,
            color: "#656D78",
            margin: "md",
          },
          {
            type: "text",
            text: `⏱️ บอทอยู่ได้สูงสุด ${maxMin} นาที (ตามโควต้าที่จองไว้)`,
            size: "xs",
            color: "#9CA3AF",
            margin: "md",
          },
          { type: "separator", margin: "md" },
          {
            type: "text",
            text: "🔒 ผู้ส่งลิงก์รับผิดชอบการขอความยินยอมบันทึกในห้อง · ไฟล์เสียงถูกลบทันทีหลังสรุปเสร็จ",
            size: "xxs",
            wrap: true,
            color: "#9CA3AF",
            margin: "md",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        contents: [
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "postback",
              label: "✕ ยกเลิก ให้บอทออกจากห้อง",
              data: `botcancel:${jobId}`,
              displayText: "ยกเลิกบอท",
            },
          },
        ],
      },
    },
  };
}

/** วางลิงก์ประชุม → gate + hold + createBot → reply การ์ดยืนยัน. คืน true ถ้าจัดการแล้ว */
async function handleMeetingLink(
  admin: ReturnType<typeof createAdminClient>,
  lineUserId: string,
  text: string,
  replyToken: string,
): Promise<boolean> {
  const found = extractMeetingUrl(text);
  if (!found) return false;

  const profile = await getProfileByLineId(admin, lineUserId);
  if (!profile) {
    await replyText(
      replyToken,
      "❌ ยังไม่ได้ผูกบัญชี — แอด LINE OA นี้ใหม่อีกครั้งเพื่อเริ่มใช้งานครับ",
    );
    return true;
  }
  if (!(await checkSttAccess(admin, profile.id, profile.role))) {
    await replyText(replyToken, "❌ บัญชีนี้ยังไม่มีสิทธิ์ใช้ผู้ช่วย AI ครับ");
    return true;
  }

  // PDPA §8 — first-use consent gate: บอทจะเข้าไปบันทึก "ผู้ร่วมประชุมคนอื่น"
  // ครั้งแรกต้องกดยอมรับก่อน (footer disclaimer ไม่พอ) แล้ววางลิงก์อีกครั้ง
  if (!profile.bot_consent_at) {
    await replyLine(replyToken, [buildBotConsentFlex()]);
    return true;
  }

  const activeOrg = await getOrSetActiveOrg(admin, profile.id, profile.line_active_org_id);
  if (!activeOrg) {
    await replyText(replyToken, "❌ ไม่พบพื้นที่ทำงานของคุณ กรุณาลองใหม่ภายหลังครับ");
    return true;
  }

  // นัดเวลาล่วงหน้า (ระบุวัน-เวลา + อีก >10 นาที) → เขียนลงปฏิทิน + เตือน/ยืนยันส่งบอท 5 นาทีก่อนเริ่ม (Phase 1c)
  const joinAt = parseMeetingDateTime(text);
  if (joinAt && joinAt.getTime() - Date.now() > 10 * 60 * 1000) {
    return await handleFutureMeetingLink(
      admin,
      profile.id,
      activeOrg.id,
      found,
      joinAt,
      text,
      replyToken,
    );
  }

  // ประชุมตอนนี้ (ลิงก์ไม่มีเวลา) → confirm-before-send (Phase 1-pre)
  const { remainSec, remainMin } = await getBotRemaining(admin, profile.id);
  if (remainSec < BOT_MIN_START) {
    await replyLine(replyToken, [buildQuotaTopupFlex(remainMin, BOT_MIN_START / 60)]);
    return true;
  }

  const dedupKey = makeDedupKey(found.url, new Date()); // bucket 30 นาที กันวางซ้ำ
  const { data: dup } = await admin
    .from("assistant_jobs")
    .select("bot_state")
    .eq("dedup_key", dedupKey)
    .maybeSingle();
  // dedup_key unique → มีได้แถวเดียว; ถ้ายัง active (รวม awaiting_confirm) = มีอยู่แล้ว
  const dupState = (dup as { bot_state?: string } | null)?.bot_state;
  if (
    dup &&
    !["cancelled", "fatal", "create_failed", "recording_ready", "done"].includes(dupState ?? "")
  ) {
    await replyText(
      replyToken,
      dupState === "awaiting_confirm"
        ? "🤖 มีการ์ดยืนยันส่งบอทห้องนี้ค้างอยู่แล้ว กดยืนยันในการ์ดก่อนหน้าได้เลยครับ"
        : "🤖 บอทกำลังเข้าห้องประชุมนี้อยู่แล้วครับ",
    );
    return true;
  }

  // dup เก่าที่จบแล้ว (terminal) ใน slot เดียวกัน → ลบทิ้งเพื่อปล่อย dedup_key ให้ paste ใหม่ได้
  if (dup) await admin.from("assistant_jobs").delete().eq("dedup_key", dedupKey);

  const platformLabel = PLATFORM_LABEL[found.platform] ?? "ห้องประชุม";

  // สร้าง job "รอยืนยัน" (ยังไม่ hold / ยังไม่ createBot) — ผู้ใช้ต้องกดยืนยันในการ์ดก่อน (confirm-before-send)
  const { data: jobRow, error: insErr } = await admin
    .from("assistant_jobs")
    .insert({
      org_id: activeOrg.id,
      profile_id: profile.id,
      source: "recall",
      kind: "stt",
      audio_url: null,
      file_name: `${platformLabel} recording`,
      mime_type: "audio/mp4",
      meeting_url: found.url,
      dedup_key: dedupKey,
      join_at: null,
      bot_state: "awaiting_confirm",
      triggered_by: profile.id,
    })
    .select("id")
    .single();
  if (insErr || !jobRow) {
    await replyText(replyToken, "🤖 บอทกำลังเข้าห้องประชุมนี้อยู่แล้วครับ"); // unique violation = ซ้ำ
    return true;
  }
  const jobId = (jobRow as { id: string }).id;

  await replyLine(replyToken, [
    buildBotConfirmFlex({
      platformLabel,
      remainMin,
      lowQuota: remainSec < BOT_LOW_QUOTA,
      confirmData: `botsend:${jobId}`,
    }),
  ]);
  return true;
}

/** ดึงชื่อ event จากข้อความผู้ใช้ (ตัด URL ออก) → fallback "ประชุม (<platform>)" */
function deriveEventTitle(text: string, meetingUrl: string, platformLabel: string): string {
  // ตัด url + query/slug ที่ติดกันท้าย url ด้วย (GMeet regex หยุดก่อน `?` → เหลือ ?authuser=0 ค้าง)
  const escaped = meetingUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cleaned = text
    .replace(new RegExp(escaped + "\\S*", "g"), "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : `ประชุม (${platformLabel})`;
}

/** ลิงก์ประชุมมีเวลานัดอนาคต → เขียนลง Google Calendar (ถ้าเชื่อมแล้ว) + cache · บอทส่งทีหลังผ่านการเตือน 5 นาทีก่อน */
async function handleFutureMeetingLink(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  orgId: string,
  found: { platform: string; url: string },
  joinAt: Date,
  text: string,
  replyToken: string,
): Promise<boolean> {
  const platformLabel = PLATFORM_LABEL[found.platform] ?? "ห้องประชุม";
  const joinAtText = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "long",
    timeStyle: "short",
  }).format(joinAt);

  // ชวนเชื่อม Google ผ่าน LINE (magic link → /line/connect-calendar) — ใช้ทั้งตอนยังไม่เชื่อม + token เพิกถอน
  const sendConnectCard = async () => {
    const token = crypto.randomBytes(24).toString("base64url");
    await admin.from("web_login_tokens").insert({
      token,
      profile_id: profileId,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    const base = (process.env.APP_BASE_URL ?? "https://app.perpos.ai").replace(/\/$/, "");
    await replyLine(replyToken, [
      buildConnectCalendarFlex(
        `${base}/line/claim?t=${token}&next=${encodeURIComponent("/line/connect-calendar")}`,
      ),
    ]);
  };

  // ต้องเชื่อม Google ก่อน — refresh ล้ม/เพิกถอน (throw) ถือว่ายังไม่เชื่อม → ชวนเชื่อม (ไม่ปล่อย error หลุด → กัน webhook 500/retry)
  let accessToken: string | null = null;
  try {
    accessToken = await getCalendarAccessTokenForProfile(admin, profileId);
  } catch {
    accessToken = null;
  }
  if (!accessToken) {
    await sendConnectCard();
    return true;
  }

  // dedup ห้องเดียวกัน (เทียบด้วย meeting_key ที่ normalize — Zoom/Teams ลิงก์ต่างฟอร์แมตก็จับได้)
  // ในหน้าต่างเวลา ±30 นาที ที่ยังไม่ถูกลบ → ไม่เขียนซ้ำ
  const meetingKey = normalizeMeetingUrl(found.url);
  const lo = new Date(joinAt.getTime() - 30 * 60 * 1000).toISOString();
  const hi = new Date(joinAt.getTime() + 30 * 60 * 1000).toISOString();
  const { data: existing } = await admin
    .from("recall_calendar_events")
    .select("id")
    .eq("profile_id", profileId)
    .eq("meeting_key", meetingKey)
    .eq("is_deleted", false)
    .gte("starts_at", lo)
    .lte("starts_at", hi)
    .limit(1)
    .maybeSingle();
  if (existing) {
    await replyText(replyToken, `📅 มีนัดประชุมนี้ในปฏิทินอยู่แล้ว (${joinAtText} น.) ครับ`);
    return true;
  }

  const title = deriveEventTitle(text, found.url, platformLabel);
  let googleEventId: string | null = null;
  try {
    const ev = await createCalendarEvent({ accessToken, title, startsAt: joinAt.toISOString() });
    googleEventId = ev?.id ?? null;
  } catch {
    await sendConnectCard(); // token เพิกถอน/หมดสิทธิ์ → ชวนเชื่อมใหม่
    return true;
  }

  await admin.from("recall_calendar_events").insert({
    profile_id: profileId,
    org_id: orgId,
    google_event_id: googleEventId,
    source: "line",
    title,
    meeting_url: found.url,
    meeting_key: meetingKey,
    starts_at: joinAt.toISOString(),
    confirm_state: "pending",
  });
  // เชื่อม + ใช้ปฏิทินแล้ว = opt-in sync ปฏิทินอัตโนมัติ (scheduler step 1b จะกวาด event อื่นมาเตือนให้ด้วย)
  await admin
    .from("meeting_calendar_settings")
    .upsert({ profile_id: profileId }, { onConflict: "profile_id", ignoreDuplicates: true });
  await replyLine(replyToken, [buildCalendarSavedFlex(title, joinAtText, platformLabel)]);
  return true;
}

/** ปุ่มยืนยันส่งบอท (postback botsend:<jobId>) → hold + createBot → การ์ด "บอทกำลังเข้าห้อง" */
async function handleRecallSend(
  admin: ReturnType<typeof createAdminClient>,
  lineUserId: string,
  jobId: string,
  replyToken: string,
): Promise<void> {
  const { data: jobData } = await admin
    .from("assistant_jobs")
    .select("id, profile_id, org_id, meeting_url, join_at, bot_state")
    .eq("id", jobId)
    .maybeSingle();
  const job = jobData as {
    id: string;
    profile_id: string | null;
    org_id: string | null;
    meeting_url: string | null;
    join_at: string | null;
    bot_state: string | null;
  } | null;
  if (!job) {
    await replyText(replyToken, "ไม่พบรายการนี้แล้วครับ");
    return;
  }

  // ตรวจเจ้าของ (กันคนอื่นกดส่งบอทแทน)
  const { data: prof } = await admin
    .from("profiles")
    .select("line_user_id")
    .eq("id", job.profile_id ?? "")
    .maybeSingle();
  if ((prof as { line_user_id?: string } | null)?.line_user_id !== lineUserId) return;

  if (job.bot_state !== "awaiting_confirm") {
    await replyText(replyToken, "🤖 รายการนี้ส่งบอทหรือยกเลิกไปแล้วครับ");
    return;
  }
  if (!job.meeting_url || !job.org_id || !job.profile_id) {
    await admin.from("assistant_jobs").delete().eq("id", jobId);
    await replyText(replyToken, "ข้อมูลรายการไม่ครบ ลองวางลิงก์ใหม่อีกครั้งครับ");
    return;
  }

  const { remainSec, remainMin } = await getBotRemaining(admin, job.profile_id);
  if (remainSec < BOT_MIN_START) {
    await admin.from("assistant_jobs").delete().eq("id", jobId);
    await replyLine(replyToken, [buildQuotaTopupFlex(remainMin, BOT_MIN_START / 60)]);
    return;
  }

  const EST = remainSec; // จองตามโควต้าที่เหลือจริง — บอทอยู่ได้จนหมดโควต้า (scheduler สั่งออกเมื่อครบ)

  // กัน double-send: claim job (awaiting_confirm → creating) แบบ atomic — กดปุ่มซ้ำเร็ว ๆ จะ claim ได้คนเดียว
  // เซ็ต hold_seconds = EST ด้วย (scheduler step 7 ใช้เป็นเพดานเวลาสั่งบอทออกเมื่อครบโควต้า)
  const { data: claim } = await admin
    .from("assistant_jobs")
    .update({ bot_state: "creating", hold_seconds: EST, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("bot_state", "awaiting_confirm")
    .select("id");
  if (!claim || (claim as unknown[]).length === 0) {
    await replyText(replyToken, "🤖 กำลังดำเนินการอยู่แล้วครับ");
    return;
  }
  const { data: held } = await admin.rpc("hold_bot_quota", {
    p_profile_id: job.profile_id,
    p_seconds: EST,
    p_job_id: jobId,
  });
  if (!held || (held as { ok?: boolean }).ok !== true) {
    await admin.from("assistant_jobs").delete().eq("id", jobId);
    await replyLine(replyToken, [buildQuotaTopupFlex(remainMin, BOT_MIN_START / 60)]);
    return;
  }

  await dispatchHeldBotJob(
    admin,
    {
      id: jobId,
      profile_id: job.profile_id,
      org_id: job.org_id,
      meeting_url: job.meeting_url,
      join_at: job.join_at,
    },
    EST,
    replyToken,
    "awaiting_confirm",
  );
}

/**
 * LINE wrapper รอบ createBotForHeldJob (lib) — job 'creating' + hold แล้ว → createBot → reply การ์ดตาม outcome
 * ใช้ร่วม botsend + calsend · core (createBot/refund/state) อยู่ที่ lib/assistant/recall-bot.ts
 */
async function dispatchHeldBotJob(
  admin: ReturnType<typeof createAdminClient>,
  job: HeldJob,
  EST: number,
  replyToken: string,
  adhocFail: "awaiting_confirm" | "delete",
): Promise<void> {
  const outcome = await createBotForHeldJob(admin, job, EST, adhocFail);
  switch (outcome.kind) {
    case "sent":
      await replyLine(replyToken, [
        buildLinkConfirmFlex(outcome.platformLabel, outcome.estMin, job.id, outcome.joinAtText),
      ]);
      break;
    case "cancelled":
      break; // การ์ดยกเลิกถูกส่งโดย cancel handler แล้ว
    case "busy":
      await replyText(replyToken, "⏳ ระบบกำลังหนาแน่น กดยืนยันอีกครั้งใน 1–2 นาทีได้เลยครับ 🙏");
      break;
    case "fatal":
      await replyLine(replyToken, [
        buildBotFlex("fatal", { reason: "เข้าห้องประชุมไม่สำเร็จ ลองใหม่อีกครั้งได้เลยครับ" }),
      ]);
      break;
  }
}

/** ปุ่มยืนยันส่งบอทจากปฏิทิน (postback calsend:<eventId>) → reconcile + สร้าง job + hold + createBot */
async function handleCalendarSend(
  admin: ReturnType<typeof createAdminClient>,
  lineUserId: string,
  eventId: string,
  replyToken: string,
): Promise<void> {
  const { data: evData } = await admin
    .from("recall_calendar_events")
    .select(
      "id, profile_id, org_id, meeting_url, meeting_key, starts_at, confirm_state, bot_job_id, is_deleted",
    )
    .eq("id", eventId)
    .maybeSingle();
  const ev = evData as {
    id: string;
    profile_id: string;
    org_id: string | null;
    meeting_url: string;
    meeting_key: string | null;
    starts_at: string;
    confirm_state: string;
    bot_job_id: string | null;
    is_deleted: boolean;
  } | null;
  if (!ev) {
    await replyText(replyToken, "ไม่พบนัดประชุมนี้แล้วครับ");
    return;
  }

  const { data: prof } = await admin
    .from("profiles")
    .select("line_user_id, line_active_org_id")
    .eq("id", ev.profile_id)
    .maybeSingle();
  const profRow = prof as { line_user_id?: string; line_active_org_id?: string } | null;
  if (profRow?.line_user_id !== lineUserId) return;

  if (ev.is_deleted || ev.bot_job_id || ev.confirm_state === "confirmed") {
    await replyText(replyToken, "🤖 ส่งบอทเข้าประชุมนี้แล้ว หรือถูกยกเลิกไปครับ");
    return;
  }

  const orgId = ev.org_id ?? profRow?.line_active_org_id ?? null;
  if (!orgId) {
    await replyText(replyToken, "❌ ไม่พบพื้นที่ทำงานของคุณ ลองใหม่ภายหลังครับ");
    return;
  }

  // M2 reconcile: มี bot job ห้องเดียวกัน (meeting_key) + เวลาใกล้กัน active อยู่แล้ว → ไม่ส่งซ้ำ
  const meetingKey = ev.meeting_key ?? normalizeMeetingUrl(ev.meeting_url);
  if (
    await hasActiveBotForMeeting(admin, ev.profile_id, meetingKey, new Date(ev.starts_at).getTime())
  ) {
    await admin
      .from("recall_calendar_events")
      .update({ confirm_state: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", ev.id);
    await replyText(replyToken, "🤖 บอทสำหรับประชุมนี้กำลังดำเนินการอยู่แล้วครับ");
    return;
  }

  const { remainSec, remainMin } = await getBotRemaining(admin, ev.profile_id);
  if (remainSec < BOT_MIN_START) {
    await replyLine(replyToken, [buildQuotaTopupFlex(remainMin, BOT_MIN_START / 60)]);
    return;
  }
  const EST = remainSec;

  // สร้าง job เป็น 'creating' ตรง ๆ (การ์ดเตือน = ขั้นยืนยันแล้ว) — dedup ตามเวลานัด
  const dedupKey = makeDedupKey(ev.meeting_url, new Date(ev.starts_at));
  const { data: jobRow, error: insErr } = await admin
    .from("assistant_jobs")
    .insert({
      org_id: orgId,
      profile_id: ev.profile_id,
      source: "recall",
      kind: "stt",
      audio_url: null,
      file_name: "meeting recording",
      mime_type: "audio/mp4",
      meeting_url: ev.meeting_url,
      dedup_key: dedupKey,
      hold_seconds: EST,
      join_at: ev.starts_at,
      bot_state: "creating",
      triggered_by: ev.profile_id,
    })
    .select("id")
    .single();
  if (insErr || !jobRow) {
    await replyText(replyToken, "🤖 บอทกำลังเข้าห้องประชุมนี้อยู่แล้วครับ"); // dedup ชน
    return;
  }
  const jobId = (jobRow as { id: string }).id;

  const { data: held } = await admin.rpc("hold_bot_quota", {
    p_profile_id: ev.profile_id,
    p_seconds: EST,
    p_job_id: jobId,
  });
  if (!held || (held as { ok?: boolean }).ok !== true) {
    await admin.from("assistant_jobs").delete().eq("id", jobId);
    await replyLine(replyToken, [buildQuotaTopupFlex(remainMin, BOT_MIN_START / 60)]);
    return;
  }
  await admin
    .from("recall_calendar_events")
    .update({ bot_job_id: jobId, confirm_state: "confirmed", updated_at: new Date().toISOString() })
    .eq("id", ev.id);

  await dispatchHeldBotJob(
    admin,
    {
      id: jobId,
      profile_id: ev.profile_id,
      org_id: orgId,
      meeting_url: ev.meeting_url,
      join_at: ev.starts_at,
    },
    EST,
    replyToken,
    "delete",
  );
}

/** ปุ่มยกเลิกบอท (postback botcancel:<jobId>) → leave/delete + refund */
async function handleRecallCancel(
  admin: ReturnType<typeof createAdminClient>,
  lineUserId: string,
  jobId: string,
  replyToken: string,
): Promise<void> {
  const { data: jobData } = await admin
    .from("assistant_jobs")
    .select("id, profile_id, recall_bot_id, bot_state, recording_started_at")
    .eq("id", jobId)
    .maybeSingle();
  const job = jobData as {
    id: string;
    profile_id: string | null;
    recall_bot_id: string | null;
    bot_state: string | null;
    recording_started_at: string | null;
  } | null;
  if (!job) return;

  // ตรวจเจ้าของ (กันคนอื่นยกเลิกบอทเรา)
  const { data: prof } = await admin
    .from("profiles")
    .select("line_user_id")
    .eq("id", job.profile_id ?? "")
    .maybeSingle();
  if ((prof as { line_user_id?: string } | null)?.line_user_id !== lineUserId) return;

  if (
    ["cancelled", "fatal", "recording_ready", "done", "failed_permanent", "stuck"].includes(
      job.bot_state ?? "",
    )
  ) {
    await replyText(replyToken, "งานนี้จบหรือถูกยกเลิกไปแล้วครับ");
    return;
  }

  // ถ้า settle เกิดแล้ว (บอทออกเพราะครบโควต้า — scheduler หักโควต้า + แจ้งไปแล้ว) → ยกเลิกไม่ได้
  // ห้ามอ้างคืนโควต้า (เป็น usage จริง) + กันข้อความขัดกับ "ครบโควต้า" ที่ส่งไปแล้ว
  const { data: settled } = await admin
    .from("token_ledger")
    .select("id")
    .eq("job_id", jobId)
    .eq("kind", "adjust")
    .eq("reason", "bot-settled")
    .limit(1)
    .maybeSingle();
  if (settled || job.bot_state === "leaving") {
    await replyText(
      replyToken,
      "🤖 บอทออกจากห้องประชุมแล้ว กำลังสรุปรายงานการประชุมให้อยู่ครับ 🙏",
    );
    return;
  }

  // บอท "เริ่มอัดแล้ว" (มีเสียงประชุม) → นำออก แล้วปล่อยให้ bot.done คิดตามเวลาบอทในห้อง + ถอดเท่าที่บันทึก
  //   ไม่ refund, ไม่ mark cancelled (ให้ pipeline done→worker ทำต่อ: settle presence + ส่ง MoM)
  if (job.recording_started_at) {
    if (job.recall_bot_id) await leaveBot(job.recall_bot_id).catch(() => false);
    await replyText(
      replyToken,
      "🤖 นำบอทออกจากห้องแล้ว — จะส่งสรุปการประชุมเท่าที่บันทึกได้ และคิดโควต้าตามเวลาที่บอทอยู่ในห้องครับ",
    );
    return;
  }

  // ยังไม่เริ่มอัดเลย (รอหน้าห้อง/ยังไม่เริ่มประชุม) → คืนโควต้าเต็ม (ไม่คิด แม้ Recall อาจคิดเรา)
  if (job.recall_bot_id) {
    if (job.bot_state === "scheduled")
      await deleteScheduledBot(job.recall_bot_id).catch(() => false);
    else await leaveBot(job.recall_bot_id).catch(() => false);
  }
  await admin.rpc("refund_bot_quota", { p_job_id: jobId }).then(
    () => undefined,
    () => undefined,
  );
  await admin
    .from("assistant_jobs")
    .update({ status: "failed", bot_state: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  const { remainMin } = await getBotRemaining(admin, job.profile_id ?? "");
  await replyLine(replyToken, [
    {
      type: "flex",
      altText: "✅ ยกเลิกบอทแล้ว คืนโควต้าให้เรียบร้อย",
      contents: {
        type: "bubble",
        header: {
          type: "box",
          layout: "horizontal",
          backgroundColor: "#3C3B3D",
          paddingAll: "14px",
          contents: [
            {
              type: "text",
              text: "✅ ยกเลิกบอทแล้ว",
              color: "#ffffff",
              weight: "bold",
              size: "md",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "18px",
          contents: [
            {
              type: "text",
              text: "นำบอทออกจากห้องประชุมแล้ว และคืนโควต้าให้เรียบร้อยครับ",
              size: "sm",
              wrap: true,
              color: "#3C3B3D",
            },
            {
              type: "text",
              text: `🤖 โควต้าบอทคงเหลือ ${remainMin} นาที`,
              size: "xs",
              color: "#9CA3AF",
              margin: "md",
            },
            { type: "separator", margin: "md" },
            {
              type: "text",
              text: "ส่งลิงก์ประชุมใหม่ได้ทุกเมื่อเพื่อเริ่มบันทึกอีกครั้งครับ",
              size: "xs",
              wrap: true,
              color: "#656D78",
              margin: "md",
            },
          ],
        },
      },
    },
  ]);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const parsed = JSON.parse(rawBody) as { events: Record<string, unknown>[] };
  const admin = createAdminClient();

  for (const event of parsed.events ?? []) {
    // ─── Follow event — auto-onboarding (แอด LINE → สร้าง account + โควต้า + welcome) ──
    if (event.type === "follow") {
      const fUserId = (event.source as Record<string, string>)?.userId ?? "";
      if (fUserId) {
        await handleFollow(admin, fUserId).catch((e) =>
          console.error("[line] follow provision failed:", String(e)),
        );
      }
      continue;
    }

    // ─── Postback — ปุ่มยืนยันถอดเสียงจาก Flex (ผู้ใช้ส่งไฟล์ก่อนพิมพ์ /mom) ──────
    if (event.type === "postback") {
      const pbUserId = (event.source as Record<string, string>)?.userId ?? "";
      const pbReplyToken = String(event.replyToken ?? "");
      const pbData = String((event.postback as Record<string, unknown>)?.data ?? "");
      if (pbUserId && pbData.startsWith("momfile:")) {
        await handleMomConfirm(admin, pbUserId, pbData.slice("momfile:".length), pbReplyToken);
      } else if (pbData === "momcancel") {
        await replyText(
          pbReplyToken,
          "รับทราบครับ — หากต้องการถอดเสียงภายหลัง ส่งไฟล์เสียงเข้ามาใหม่ได้เลย 🙏",
        );
      } else if (pbUserId && pbData.startsWith("pdffile:")) {
        // data = "pdffile:<messageId>[:<fileName>]" — messageId เป็นตัวเลข (ไม่มี :) แยกที่ : ตัวแรก
        const rest = pbData.slice("pdffile:".length);
        const sep = rest.indexOf(":");
        const pdfMsgId = sep >= 0 ? rest.slice(0, sep) : rest;
        const pdfFileName = sep >= 0 ? rest.slice(sep + 1) : "";
        await handlePdfConfirm(admin, pbUserId, pdfMsgId, pdfFileName, pbReplyToken);
      } else if (pbUserId && pbData.startsWith("pdfraster:")) {
        await handlePdfRasterConfirm(
          admin,
          pbUserId,
          pbData.slice("pdfraster:".length),
          pbReplyToken,
        );
      } else if (pbData === "pdfcancel") {
        await replyText(
          pbReplyToken,
          "รับทราบครับ — หากต้องการบีบ PDF ภายหลัง ส่งไฟล์เข้ามาใหม่ได้เลย 🙏",
        );
      } else if (pbUserId && pbData === "botconsent") {
        await handleRecallConsent(admin, pbUserId, pbReplyToken);
      } else if (pbUserId && pbData.startsWith("botsend:")) {
        await handleRecallSend(admin, pbUserId, pbData.slice("botsend:".length), pbReplyToken);
      } else if (pbUserId && pbData.startsWith("calsend:")) {
        await handleCalendarSend(admin, pbUserId, pbData.slice("calsend:".length), pbReplyToken);
      } else if (pbUserId && pbData.startsWith("botcancel:")) {
        await handleRecallCancel(admin, pbUserId, pbData.slice("botcancel:".length), pbReplyToken);
      }
      continue;
    }

    if (event.type !== "message") continue;
    const msg = event.message as Record<string, unknown>;

    const replyToken = String(event.replyToken ?? "");
    const source = event.source as Record<string, string>;
    const lineUserId = source?.userId ?? "";

    // ─── Auto-provision (self-heal) — ผู้ใช้ที่ยังไม่มี profile ส่งข้อความอะไรมาก็สร้างให้ทันที ──
    //   กันเคส follow event หลุด (เช่น webhook ตายช่วงย้ายโดเมน / deploy) → ผู้ใช้ไม่ถูก provision
    //   handleFollow = provision (idempotent) + แจกเครดิต + push welcome card ถ้าเป็นคนใหม่
    //   จากนั้นไหลเข้า logic เดิม (downstream getProfileByLineId จะเจอ profile แล้ว)
    if (lineUserId) {
      const known = await getProfileByLineId(admin, lineUserId);
      if (!known) {
        await handleFollow(admin, lineUserId).catch((e) =>
          console.error("[line] message-path provision failed:", String(e)),
        );
      }
    }

    // ─── Image messages — CRM photo attachment ──────────────────────────────
    if (msg.type === "image") {
      const messageId = String(msg.id ?? "");
      if (lineUserId && messageId) {
        const imgProfile = await getProfileByLineId(admin, lineUserId);
        if (imgProfile) {
          await handleCrmPhoto(admin, lineUserId, messageId, imgProfile.id, replyToken);
        }
      }
      continue;
    }

    // Location messages not handled (GPS captured via web link instead)
    if (msg.type === "location") continue;

    // ─── ไฟล์ที่ผู้ใช้ส่งมา — โยนมาเลยไม่ต้องพิมพ์คำสั่ง: ระบบดูชนิด + ถาม Flex ยืนยันก่อนทำ ──
    //   เสียง/วิดีโอ → ถอดเสียง (MoM) · PDF → บีบขนาด
    if (msg.type === "audio" || msg.type === "file") {
      const messageId = String(msg.id ?? "");
      if (!lineUserId || !messageId) continue;

      const fileName = String(msg.fileName ?? "");
      const isAudioFile =
        msg.type === "audio" || /\.(ogg|mp3|m4a|wav|mp4|aac|flac|webm|opus)$/i.test(fileName);
      const isPdfFile = msg.type === "file" && /\.pdf$/i.test(fileName);

      // legacy: ถ้ายังมี session /mom ค้าง (ผู้ใช้พิมพ์ /mom) → ถอดเสียงทันที (ข้ามการถาม)
      const { data: sess } = await admin
        .from("assistant_line_sessions")
        .select("org_id, profile_id, expires_at")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      if (sess && new Date(sess.expires_at as string).getTime() >= Date.now()) {
        if (msg.type === "file" && !isAudioFile) {
          await replyText(
            replyToken,
            "❌ ไฟล์นี้ไม่ใช่ไฟล์เสียง/วิดีโอ กรุณาส่งไฟล์เสียง (mp3, ogg, m4a, wav, mp4)",
          );
          continue;
        }
        await handleMomAudio(
          admin,
          lineUserId,
          messageId,
          String(sess.profile_id),
          String(sess.org_id),
          fileName,
          replyToken,
        );
        continue;
      }

      // ไม่มี session → auto-detect ชนิดไฟล์ แล้วถาม Flex ยืนยัน
      if (!isPdfFile && !isAudioFile) continue; // ชนิดอื่น ไม่ยุ่ง
      const fileProfile = await getProfileByLineId(admin, lineUserId);
      if (!fileProfile) continue;

      // PDF → ถามว่าจะบีบขนาดไหม (โชว์โควต้าคงเหลือ · หมด=บล็อก)
      if (isPdfFile) {
        if (!(await checkPdfAccess(admin, fileProfile.id, fileProfile.role))) continue;
        const { remainUnits: pqRemain } = await getServiceRemaining(admin, fileProfile.id, "pdf");

        if (pqRemain <= 0) {
          await replyLine(replyToken, [
            {
              type: "flex",
              altText: "โควต้าบีบ PDF หมดแล้ว",
              contents: {
                type: "bubble",
                header: {
                  type: "box",
                  layout: "vertical",
                  backgroundColor: "#C43448",
                  paddingAll: "16px",
                  contents: [
                    {
                      type: "text",
                      text: "📄 โควต้าบีบ PDF หมดแล้ว",
                      color: "#ffffff",
                      weight: "bold",
                      size: "md",
                    },
                  ],
                },
                body: {
                  type: "box",
                  layout: "vertical",
                  spacing: "sm",
                  paddingAll: "20px",
                  contents: [
                    {
                      type: "text",
                      text: "เครดิตของคุณไม่พอสำหรับบีบ PDF",
                      weight: "bold",
                      size: "sm",
                      color: "#1A1A1B",
                      wrap: true,
                    },
                    {
                      type: "text",
                      text: "พิมพ์ /web เพื่อเติมเครดิต แล้วส่งไฟล์อีกครั้ง 🙏",
                      size: "xs",
                      color: "#656D78",
                      wrap: true,
                      margin: "sm",
                    },
                  ],
                },
              },
            },
          ]);
          continue;
        }

        await replyLine(replyToken, [
          {
            type: "flex",
            altText: "ได้รับไฟล์ PDF แล้ว — ต้องการบีบขนาดไหม?",
            contents: {
              type: "bubble",
              body: {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                paddingAll: "18px",
                contents: [
                  {
                    type: "box",
                    layout: "horizontal",
                    spacing: "sm",
                    alignItems: "center",
                    contents: [
                      { type: "text", text: "📄", size: "lg", flex: 0 },
                      {
                        type: "text",
                        text: "ได้รับไฟล์ PDF แล้ว",
                        weight: "bold",
                        size: "md",
                        color: "#3C3B3D",
                        gravity: "center",
                      },
                    ],
                  },
                  { type: "separator", margin: "md" },
                  {
                    type: "text",
                    text: "ต้องการให้ช่วยบีบขนาดไฟล์นี้ให้เล็กลง (คงความชัด) ไหมครับ?",
                    size: "sm",
                    wrap: true,
                    color: "#3C3B3D",
                    margin: "md",
                  },
                  ...(fileName
                    ? [
                        {
                          type: "text",
                          text: `📎 ${fileName}`,
                          size: "xs",
                          wrap: true,
                          color: "#9CA3AF",
                        } as const,
                      ]
                    : []),
                  {
                    type: "text",
                    text: `📊 เครดิตคงเหลือ พอบีบได้อีก ~${pqRemain} หน้า`,
                    size: "xs",
                    color: "#9CA3AF",
                  },
                ],
              },
              footer: {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                paddingAll: "14px",
                paddingTop: "4px",
                contents: [
                  {
                    type: "button",
                    style: "primary",
                    color: "#3C3B3D",
                    height: "sm",
                    action: {
                      type: "postback",
                      label: "บีบขนาดเลย",
                      // ฝากชื่อไฟล์เดิมไปด้วย (กดยืนยันแล้วจะได้ใช้ชื่อจริง ไม่ใช่ document-<ts>)
                      //   LINE จำกัด data 300 ตัวอักษร — ยาวเกินค่อย fallback เป็น messageId อย่างเดียว
                      data:
                        `pdffile:${messageId}:${fileName}`.length <= 300
                          ? `pdffile:${messageId}:${fileName}`
                          : `pdffile:${messageId}`,
                      displayText: "บีบไฟล์นี้",
                    },
                  },
                  {
                    type: "button",
                    style: "secondary",
                    height: "sm",
                    action: {
                      type: "postback",
                      label: "ไม่เป็นไร",
                      data: "pdfcancel",
                      displayText: "ไม่เป็นไร",
                    },
                  },
                ],
              },
            },
          },
        ]);
        continue;
      }

      // เสียง/วิดีโอ → ถามว่าจะถอดเป็นรายงานการประชุมไหม
      if (!(await checkSttAccess(admin, fileProfile.id, fileProfile.role))) continue;
      await replyLine(replyToken, [
        {
          type: "flex",
          altText: "ได้รับไฟล์เสียงแล้ว — ต้องการให้ถอดเป็นรายงานการประชุมไหม?",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              paddingAll: "18px",
              contents: [
                {
                  type: "box",
                  layout: "horizontal",
                  spacing: "sm",
                  alignItems: "center",
                  contents: [
                    { type: "text", text: "🎧", size: "lg", flex: 0 },
                    {
                      type: "text",
                      text: "ได้รับไฟล์เสียงแล้ว",
                      weight: "bold",
                      size: "md",
                      color: "#4DB0D3",
                      gravity: "center",
                    },
                  ],
                },
                { type: "separator", margin: "md" },
                {
                  type: "text",
                  text: "ต้องการให้ช่วยถอดเป็นรายงานการประชุม (MoM) จากไฟล์นี้ไหมครับ?",
                  size: "sm",
                  wrap: true,
                  color: "#3C3B3D",
                  margin: "md",
                },
                ...(fileName
                  ? [
                      {
                        type: "text",
                        text: `📄 ${fileName}`,
                        size: "xs",
                        wrap: true,
                        color: "#9CA3AF",
                      } as const,
                    ]
                  : []),
              ],
            },
            footer: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              paddingAll: "14px",
              paddingTop: "4px",
              contents: [
                {
                  type: "button",
                  style: "primary",
                  color: "#4DB0D3",
                  height: "sm",
                  action: {
                    type: "postback",
                    label: "ถอดเสียงเลย",
                    data: `momfile:${messageId}`,
                    displayText: "ถอดเสียงไฟล์นี้",
                  },
                },
                {
                  type: "button",
                  style: "secondary",
                  height: "sm",
                  action: {
                    type: "postback",
                    label: "ไม่เป็นไร",
                    data: "momcancel",
                    displayText: "ไม่เป็นไร",
                  },
                },
              ],
            },
          },
        },
      ]);
      continue;
    }

    if (msg.type !== "text") continue;

    const text = String(msg.text ?? "").trim();

    // วางลิงก์ประชุม (ไม่ขึ้นต้นด้วย /) → ส่งบอท Recall เข้าห้อง
    if (lineUserId && extractMeetingUrl(text)) {
      await handleMeetingLink(admin, lineUserId, text, replyToken);
      continue;
    }

    // ข้อความอิสระ (ไม่ใช่คำสั่ง /) ที่ "ดูเป็นคำถาม" → ผู้ช่วยโฟล์ตอบด้วย RAG
    if (!text.startsWith("/")) {
      if (lineUserId && isProductQuestion(text)) {
        await handleFlowChat(admin, lineUserId, text, replyToken);
      }
      continue;
    }

    const [cmd, ...args] = text.slice(1).split(" ");

    // /link <token> — no auth needed
    if (cmd === "link" && args[0]) {
      await handleLink(admin, lineUserId, args[0], replyToken);
      continue;
    }

    // All other commands require a linked profile
    const profile = await getProfileByLineId(admin, lineUserId);
    if (!profile) {
      await replyText(
        replyToken,
        "❌ ยังไม่ได้ผูกบัญชี LINE\n" +
          'ไปที่ "ตั้งค่าโปรไฟล์" ในระบบ PERPOS แล้วกด "ผูกบัญชี LINE"',
      );
      continue;
    }

    // /แจ้งปัญหา · /bug · /report <ข้อความ> — แจ้งปัญหาเข้า Issue Tracker (ไม่ต้องใช้ org)
    if (cmd === "แจ้งปัญหา" || cmd === "bug" || cmd === "report") {
      await handleReportIssue(
        admin,
        profile.id,
        lineUserId,
        args.join(" "),
        String(msg.id ?? ""),
        replyToken,
      );
      continue;
    }

    // /org [N] — list or switch active organization
    if (cmd === "org") {
      await handleOrgCmd(admin, profile.id, args, replyToken);
      continue;
    }

    // Resolve active org (auto-sets on first use)
    const activeOrg = await getOrSetActiveOrg(admin, profile.id, profile.line_active_org_id);

    // /help — org-aware Flex Card
    if (cmd === "help") {
      if (activeOrg?.id === TMC_ORG_ID) {
        await handleTmcHelp(replyToken);
      } else {
        const [hasStt, hasPdf] = await Promise.all([
          checkSttAccess(admin, profile.id, profile.role),
          checkPdfAccess(admin, profile.id, profile.role),
        ]);
        // Check just_me module
        let hasJustMe = false;
        // Check jaquar module
        let hasJaquar = false;
        if (activeOrg) {
          const [jmSetting, jqSetting] = await Promise.all([
            admin
              .from("org_module_settings")
              .select("is_enabled")
              .eq("organization_id", activeOrg.id)
              .eq("module_key", "just_me")
              .maybeSingle(),
            admin
              .from("org_module_settings")
              .select("is_enabled")
              .eq("organization_id", activeOrg.id)
              .eq("module_key", "jaquar")
              .maybeSingle(),
          ]);
          hasJustMe = Boolean(jmSetting.data?.is_enabled);
          hasJaquar = Boolean(jqSetting.data?.is_enabled);
        }

        const cmdRow = (code: string, desc: string) => ({
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            { type: "text", text: code, size: "xs", color: "#6C5A92", flex: 2, weight: "bold" },
            { type: "text", text: desc, size: "xs", color: "#3C3B3D", flex: 4, wrap: true },
          ],
        });

        const bodyContents: unknown[] = [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#F5F7FA",
            cornerRadius: "md",
            paddingAll: "10px",
            borderWidth: "1px",
            borderColor: "#E6E9EE",
            contents: [
              {
                type: "text",
                text: `🏢 ${activeOrg?.name ?? "ไม่มี Org"}`,
                size: "sm",
                color: "#2A2A2C",
                weight: "bold",
                wrap: true,
              },
            ],
          },
          { type: "separator", margin: "md" },
          {
            type: "text",
            text: "💬 พิมพ์ถามผู้ช่วยโฟล์ได้เลย เช่น “Flow คืออะไร” · “ราคาเท่าไหร่”",
            size: "xs",
            color: "#656D78",
            margin: "md",
            wrap: true,
          },
          { type: "separator", margin: "md" },
          { type: "text", text: "คำสั่งหลัก", size: "xs", color: "#9CA3AF", margin: "md" },
          cmdRow("/org", "ดู/เปลี่ยน Organization"),
          cmdRow("/แจ้งปัญหา <ข้อความ>", "แจ้งปัญหา/บั๊กให้ทีมงาน"),
          cmdRow("/help", "แสดงคำสั่งทั้งหมด"),
        ];

        if (hasStt || hasPdf) {
          bodyContents.push(
            { type: "separator", margin: "md" },
            {
              type: "text",
              text: "ผู้ช่วย AI — ส่งไฟล์เข้ามาได้เลย ไม่ต้องพิมพ์คำสั่ง",
              size: "xs",
              color: "#9CA3AF",
              margin: "md",
              wrap: true,
            },
          );
          if (hasStt) bodyContents.push(cmdRow("🎙️ ไฟล์เสียง", "→ ถอดเป็นรายงานประชุม (MoM)"));
          if (hasPdf) bodyContents.push(cmdRow("📄 ไฟล์ PDF", "→ บีบขนาดให้เล็กลง"));
          if (hasStt) bodyContents.push(cmdRow("/web", "เปิดหน้าเว็บผู้ช่วย AI"));
        }

        if (hasJustMe) {
          bodyContents.push(
            { type: "separator", margin: "md" },
            { type: "text", text: "Just Me", size: "xs", color: "#9CA3AF", margin: "md" },
            cmdRow("/ck home", "บันทึก clock ที่บ้าน"),
            cmdRow("/ck site [ชื่อ]", "บันทึก clock ที่หน้างาน"),
          );
        }

        if (hasJaquar) {
          bodyContents.push(
            { type: "separator", margin: "md" },
            { type: "text", text: "Jaquar", size: "xs", color: "#9CA3AF", margin: "md" },
            cmdRow("/jq <สินค้า>", "เช็คสต๊อกสินค้า"),
          );
        }

        bodyContents.push(
          { type: "separator", margin: "md" },
          { type: "text", text: "การเงิน", size: "xs", color: "#9CA3AF", margin: "md" },
          cmdRow("/รายรับ <จำนวน>", "บันทึกรายรับ"),
          cmdRow("/รายจ่าย <จำนวน>", "บันทึกรายจ่าย"),
        );

        await replyLine(replyToken, [
          {
            type: "flex",
            altText: "คำสั่ง PERPOS Bot",
            contents: {
              type: "bubble",
              header: {
                type: "box",
                layout: "vertical",
                paddingAll: "16px",
                background: {
                  type: "linearGradient",
                  angle: "135deg",
                  startColor: "#2A2A2C",
                  endColor: "#525866",
                },
                contents: [
                  {
                    type: "text",
                    text: "💡 PERPOS BOT",
                    weight: "bold",
                    color: "#FFFFFF",
                    size: "sm",
                  },
                  {
                    type: "text",
                    text: "คำสั่งทั้งหมด",
                    weight: "bold",
                    size: "md",
                    color: "#FFFFFF",
                    margin: "xs",
                    wrap: true,
                  },
                ],
              },
              body: {
                type: "box",
                layout: "vertical",
                paddingAll: "16px",
                spacing: "sm",
                contents: bodyContents,
              },
            },
          },
        ]);
      }
      continue;
    }

    // ─── Global commands (no active org required) ────────────────────────────

    if (cmd === "ข่าว") {
      if (!(await checkPermission(admin, profile.id, "bot.news.request", profile.role))) {
        await replyText(replyToken, "❌ ไม่มีสิทธิ์ใช้คำสั่งนี้");
        continue;
      }
      await replyText(replyToken, "⏳ กำลังดึงข่าว...");
      continue;
    }

    if (cmd === "รายรับ" || cmd === "รายจ่าย") {
      const permKey = cmd === "รายรับ" ? "bot.finance.income_add" : "bot.finance.expense_add";
      if (!(await checkPermission(admin, profile.id, permKey, profile.role))) {
        await replyText(replyToken, "❌ ไม่มีสิทธิ์ใช้คำสั่งนี้");
        continue;
      }
      const amount = parseFloat(args[0] ?? "");
      if (!amount || isNaN(amount)) {
        await replyText(replyToken, "❌ ระบุจำนวนเงินให้ถูกต้อง");
        continue;
      }
      const note = args.slice(1).join(" ") || "";
      await admin.from("finance_entries").insert({
        profile_id: profile.id,
        entry_type: cmd === "รายรับ" ? "income" : "expense",
        amount,
        note,
      });
      await replyText(
        replyToken,
        `✅ บันทึก${cmd} ${amount.toLocaleString("th-TH")} บาท${note ? ` (${note})` : ""}`,
      );
      continue;
    }

    if (cmd === "mom") {
      if (!(await checkSttAccess(admin, profile.id, profile.role))) {
        await replyText(replyToken, "❌ ไม่มีสิทธิ์ถอดเสียง (ต้องเปิดใช้งานฟีเจอร์แกะเสียงก่อน)");
        continue;
      }
      if (!activeOrg) {
        await replyText(replyToken, "❌ ยังไม่ได้เลือกองค์กร พิมพ์ /org เพื่อเลือกองค์กรก่อน");
        continue;
      }
      // pre-check เครดิต — ถ้าหมดแล้วไม่ต้องเปิด session
      const { remainUnits: qRemain } = await getServiceRemaining(admin, profile.id, "stt");
      if (qRemain <= 0) {
        await replyLine(replyToken, [
          {
            type: "flex",
            altText: "โควต้าถอดเสียงหมดแล้ว — ติดต่อแอดมินเพื่อเพิ่มโควต้า",
            contents: {
              type: "bubble",
              header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#C43448",
                paddingAll: "16px",
                contents: [
                  {
                    type: "text",
                    text: "⏱️ โควต้าหมดแล้ว",
                    color: "#ffffff",
                    weight: "bold",
                    size: "md",
                  },
                ],
              },
              body: {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                paddingAll: "20px",
                contents: [
                  {
                    type: "text",
                    text: "โควต้าถอดเสียงของคุณคงเหลือ 0 นาที",
                    weight: "bold",
                    size: "sm",
                    color: "#1A1A1B",
                    wrap: true,
                  },
                  {
                    type: "text",
                    text: "กรุณาติดต่อแอดมินเพื่อขอเพิ่มโควต้า แล้วจึงส่งไฟล์ได้อีกครั้ง 🙏",
                    size: "xs",
                    color: "#656D78",
                    wrap: true,
                    margin: "sm",
                  },
                ],
              },
            },
          },
        ]);
        continue;
      }
      // best-effort: เก็บกวาด session หมดอายุที่ค้างไว้
      void admin
        .from("assistant_line_sessions")
        .delete()
        .lt("expires_at", new Date().toISOString());
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await admin.from("assistant_line_sessions").upsert(
        {
          line_user_id: lineUserId,
          org_id: activeOrg.id,
          profile_id: profile.id,
          action: "mom",
          expires_at: expiresAt,
        },
        { onConflict: "line_user_id" },
      );
      await replyLine(replyToken, [
        {
          type: "flex",
          altText: "พร้อมรับไฟล์เสียง — ส่งไฟล์การประชุมมาได้เลย",
          contents: {
            type: "bubble",
            header: {
              type: "box",
              layout: "vertical",
              backgroundColor: "#4DB0D3",
              paddingAll: "18px",
              paddingBottom: "14px",
              spacing: "xs",
              contents: [
                {
                  type: "text",
                  text: "🎙️ ถอดเสียงเป็นรายงานการประชุม",
                  color: "#ffffff",
                  weight: "bold",
                  size: "md",
                  wrap: true,
                },
                { type: "text", text: "Minutes of Meeting", color: "#E5F6FC", size: "xxs" },
              ],
            },
            body: {
              type: "box",
              layout: "vertical",
              spacing: "md",
              paddingAll: "20px",
              contents: [
                {
                  type: "text",
                  text: "ส่งไฟล์เสียงการประชุมเข้ามาได้เลยครับ",
                  weight: "bold",
                  size: "sm",
                  color: "#2A2A2C",
                  wrap: true,
                },
                {
                  type: "box",
                  layout: "vertical",
                  spacing: "sm",
                  contents: [
                    {
                      type: "box",
                      layout: "horizontal",
                      spacing: "sm",
                      alignItems: "center",
                      contents: [
                        { type: "text", text: "🎧", size: "sm", flex: 0 },
                        {
                          type: "text",
                          text: "รองรับไฟล์เสียง / วิดีโอ ขนาดไม่เกิน 200MB",
                          size: "xs",
                          color: "#656D78",
                          wrap: true,
                          gravity: "center",
                        },
                      ],
                    },
                    {
                      type: "box",
                      layout: "horizontal",
                      spacing: "sm",
                      alignItems: "center",
                      contents: [
                        { type: "text", text: "⏱️", size: "sm", flex: 0 },
                        {
                          type: "text",
                          text: `โควต้าคงเหลือ ${Math.floor(qRemain / 60)} นาที`,
                          size: "xs",
                          color: "#656D78",
                          wrap: true,
                          gravity: "center",
                        },
                      ],
                    },
                    {
                      type: "box",
                      layout: "horizontal",
                      spacing: "sm",
                      alignItems: "center",
                      contents: [
                        { type: "text", text: "📄", size: "sm", flex: 0 },
                        {
                          type: "text",
                          text: "ได้รับไฟล์ PDF รายงานการประชุมกลับอัตโนมัติ",
                          size: "xs",
                          color: "#656D78",
                          wrap: true,
                          gravity: "center",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      ]);
      continue;
    }

    if (cmd === "web") {
      // magic link เคลมบัญชี/ดูประวัติบนเว็บ (one-time, อายุ 5 นาที)
      const token = crypto.randomBytes(24).toString("base64url");
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await admin
        .from("web_login_tokens")
        .insert({ token, profile_id: profile.id, expires_at: expiresAt });
      const baseUrl = (process.env.APP_BASE_URL ?? "https://app.perpos.ai").replace(/\/$/, "");
      await replyText(
        replyToken,
        "🔗 เปิดลิงก์นี้เพื่อเข้าเว็บผู้ช่วย AI (เข้าระบบอัตโนมัติ ดูประวัติ/ดาวน์โหลดรายงาน)\n" +
          `${baseUrl}/line/claim?t=${token}\n\n` +
          "⏳ ลิงก์ใช้ได้ภายใน 5 นาที",
      );
      continue;
    }

    // ─── Org-specific commands (TMC) ─────────────────────────────────────────
    if (TMC_CMDS.includes(cmd)) {
      if (!activeOrg || activeOrg.id !== TMC_ORG_ID) {
        await replyLine(replyToken, [
          {
            type: "flex",
            altText: "ไม่รองรับคำสั่งนี้",
            contents: {
              type: "bubble",
              header: {
                type: "box",
                layout: "vertical",
                paddingAll: "16px",
                background: {
                  type: "linearGradient",
                  angle: "135deg",
                  startColor: "#C43448",
                  endColor: "#E36A7B",
                },
                contents: [
                  {
                    type: "text",
                    text: "❌ ORG ไม่รองรับ",
                    weight: "bold",
                    color: "#FFFFFF",
                    size: "sm",
                  },
                  {
                    type: "text",
                    text: `${activeOrg?.name ?? "ไม่มี Org"}`,
                    weight: "bold",
                    size: "md",
                    color: "#FFFFFF",
                    margin: "xs",
                    wrap: true,
                  },
                ],
              },
              body: {
                type: "box",
                layout: "vertical",
                paddingAll: "16px",
                spacing: "md",
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: "#FCF1F2",
                    cornerRadius: "md",
                    paddingAll: "12px",
                    borderWidth: "1px",
                    borderColor: "#F3C2C9",
                    contents: [
                      {
                        type: "text",
                        text: "พิมพ์ /org เพื่อดูและเปลี่ยน Org",
                        color: "#C43448",
                        size: "sm",
                        wrap: true,
                      },
                    ],
                  },
                ],
              },
            },
          },
        ]);
        continue;
      }

      if (cmd === "tmc" && args[0] === "help") {
        await handleTmcHelp(replyToken);
        continue;
      }

      if (cmd === "tmc" && !args[0]) {
        const token = await upsertMobileToken(profile.id, TMC_ORG_ID);
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.perpos.ai";
        await replyText(
          replyToken,
          `🏠 บันทึกการเข้าพัก TMC\n\n` +
            `${baseUrl}/tmc/checkin?t=${token}\n\n` +
            `⏱️ ลิงก์นี้ใช้ได้ 7 วัน\n` +
            `💡 กด "บันทึกรายการใหม่" ในหน้าถัดไปหลังบันทึก\n` +
            `    เพื่อรับลิงก์แก้ไขสำหรับรายการนั้น`,
        );
        continue;
      }

      if (cmd === "รับ") {
        await handleTmcRab(admin, args, profile.id, replyToken);
        continue;
      }
      if (cmd === "จ่าย") {
        await handleTmcJai(admin, args, profile.id, replyToken);
        continue;
      }
      if (cmd === "บัญชี") {
        await handleTmcBill(admin, args, replyToken);
        continue;
      }
      if (cmd === "stock") {
        const subCmd = args[0] ?? "";
        if (!["รับ", "ออก"].includes(subCmd)) {
          await replyText(replyToken, "❌ ใช้ /stock รับ หรือ /stock ออก");
        } else {
          await handleTmcStock(admin, subCmd, args.slice(1), profile.id, replyToken);
        }
        continue;
      }
      if (cmd === "stkin") {
        await handleStkIn(admin, args, profile.id, replyToken);
        continue;
      }
      if (cmd === "stkout") {
        await handleStkOut(admin, args, profile.id, replyToken);
        continue;
      }
      if (cmd === "stk") {
        await handleStkBal(admin, replyToken);
        continue;
      }
      if (cmd === "เช็คอิน") {
        await handleTmcCheckin(admin, args, profile.id, replyToken);
        continue;
      }
      if (cmd === "pcin") {
        await handlePcIn(admin, args, profile.id, replyToken);
        continue;
      }
      if (cmd === "pcout") {
        await handlePcOut(admin, args, profile.id, replyToken);
        continue;
      }
      if (cmd === "pcbal") {
        await handlePcBal(admin, replyToken);
        continue;
      }
      if (cmd === "pcfunds") {
        await handlePcFunds(admin, replyToken);
        continue;
      }
    }

    // ─── Just Me travel clock (/ck home | /ck site) ─────────────────────────
    if (cmd === "ck") {
      if (!activeOrg) {
        await replyLine(replyToken, [
          {
            type: "flex",
            altText: "ยังไม่มี Organization",
            contents: {
              type: "bubble",
              header: {
                type: "box",
                layout: "vertical",
                paddingAll: "16px",
                background: {
                  type: "linearGradient",
                  angle: "135deg",
                  startColor: "#C43448",
                  endColor: "#E36A7B",
                },
                contents: [
                  {
                    type: "text",
                    text: "❌ ไม่มี Organization",
                    weight: "bold",
                    color: "#FFFFFF",
                    size: "sm",
                  },
                  {
                    type: "text",
                    text: "กรุณาตั้งค่า Org ก่อน",
                    weight: "bold",
                    size: "md",
                    color: "#FFFFFF",
                    margin: "xs",
                    wrap: true,
                  },
                ],
              },
              body: {
                type: "box",
                layout: "vertical",
                paddingAll: "16px",
                spacing: "md",
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: "#FCF1F2",
                    cornerRadius: "md",
                    paddingAll: "12px",
                    borderWidth: "1px",
                    borderColor: "#F3C2C9",
                    contents: [
                      {
                        type: "text",
                        text: "พิมพ์ /org เพื่อตั้งค่า",
                        color: "#C43448",
                        size: "sm",
                        wrap: true,
                      },
                    ],
                  },
                ],
              },
            },
          },
        ]);
        continue;
      }
      const { data: ckModuleSetting } = await admin
        .from("org_module_settings")
        .select("is_enabled")
        .eq("organization_id", activeOrg.id)
        .eq("module_key", "just_me")
        .maybeSingle();
      if (!ckModuleSetting?.is_enabled) {
        await replyText(
          replyToken,
          '❌ Just Me module ยังไม่ได้เปิดใช้งาน\nกรุณาติดต่อผู้ดูแลระบบเพื่อเปิด module "Just Me" ใน Admin → Modules',
        );
        continue;
      }
      const subCmd = (args[0] ?? "").toLowerCase();
      if (subCmd !== "home" && subCmd !== "site") {
        await replyText(
          replyToken,
          "📍 วิธีใช้:\n/ck home — บันทึก clock ที่บ้าน\n/ck site [ชื่อ] — บันทึก clock ที่หน้างาน\n\nตัวอย่าง:\n/ck home\n/ck site บริษัท ABC",
        );
        continue;
      }
      const locationType = subCmd as "home" | "site";
      const ckNote = args.slice(1).join(" ").trim() || undefined;
      await handleJustMeClock(
        admin,
        lineUserId,
        profile.id,
        activeOrg.id,
        replyToken,
        locationType,
        ckNote,
      );
      continue;
    }

    // ─── Jaquar Stock Check (/jq | /jaquar) ─────────────────────────────────
    if (cmd === "jq" || cmd === "jaquar") {
      if (!activeOrg) {
        await replyText(replyToken, "❌ ยังไม่มี Organization\nพิมพ์ /org เพื่อตั้งค่า");
        continue;
      }

      const { data: jaquarSetting } = await admin
        .from("org_module_settings")
        .select("is_enabled")
        .eq("organization_id", activeOrg.id)
        .eq("module_key", "jaquar")
        .maybeSingle();

      if (!jaquarSetting?.is_enabled) {
        await replyText(replyToken, "❌ Jaquar module ยังไม่ได้เปิดใช้งานใน Organization นี้");
        continue;
      }

      await handleJaquarStock(admin, activeOrg.id, args, replyToken);
      continue;
    }

    // ─── CRM commands (/n /survey /issue /mtg /log /in /out) ────────────────
    if (CRM_CMDS.includes(cmd)) {
      // /in status — no org needed
      if (cmd === "in" && args[0] === "status") {
        await handleCrmInStatus(admin, lineUserId, replyToken);
        continue;
      }

      if (!activeOrg) {
        await replyText(replyToken, "❌ ยังไม่มี Organization\nพิมพ์ /org เพื่อตั้งค่า");
        continue;
      }

      // Fetch profile name (shared by note commands + /out)
      const { data: pdata } = await admin
        .from("profiles")
        .select("display_name, email")
        .eq("id", profile.id)
        .maybeSingle();
      const profileName =
        (pdata as { display_name?: string; email?: string } | null)?.display_name ||
        (pdata as { display_name?: string; email?: string } | null)?.email ||
        "Someone";

      if (cmd === "in") {
        await handleCrmIn(
          admin,
          args,
          lineUserId,
          profile.id,
          profile.role,
          activeOrg.id,
          replyToken,
        );
        continue;
      }

      if (cmd === "out") {
        await handleCrmOut(admin, args, lineUserId, profile.id, profileName, replyToken);
        continue;
      }

      // Phase D — query commands
      if (cmd === "sol") {
        await handleCrmSolutions(admin, args, profile.id, profile.role, activeOrg.id, replyToken);
        continue;
      }
      if (cmd === "status") {
        await handleCrmStatus(admin, args, profile.id, profile.role, activeOrg.id, replyToken);
        continue;
      }
      if (cmd === "notes") {
        await handleCrmNotes(admin, args, profile.id, profile.role, activeOrg.id, replyToken);
        continue;
      }
      if (cmd === "issues") {
        await handleCrmIssues(admin, profile.id, profile.role, activeOrg.id, replyToken);
        continue;
      }
      if (cmd === "hours") {
        await handleCrmHours(admin, args, profile.id, activeOrg.id, replyToken);
        continue;
      }

      // /n /survey /issue /mtg /log
      await handleCrmCmd(
        admin,
        cmd,
        args,
        profile.id,
        profileName,
        profile.role,
        activeOrg.id,
        replyToken,
      );
      continue;
    }
  }

  return NextResponse.json({ ok: true });
}
