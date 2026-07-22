// lib/gov-procure/line-commands.ts — คำสั่ง "บันทึกข้อมูล" จากกลุ่ม LINE
// 3 คำสั่ง: /ลงขัน (เงิน) · /สถานะ (เลื่อน stage) · /งานใหม่ (เปิดงาน)
//
// กฎความปลอดภัย:
//  - เรื่องเงิน (/ลงขัน, /งานใหม่ ที่มีราคา) **ต้องกดยืนยันก่อนบันทึกเสมอ** — เก็บใน
//    gov_procure_line_pending แล้วบันทึกจริงตอนกดปุ่ม (postback) เท่านั้น
//  - สิทธิ์เช็ค 2 ครั้ง: ตอนพิมพ์คำสั่ง และตอน "กดยืนยัน" (คนกดอาจไม่ใช่คนพิมพ์)
//  - เงิน = owner/manager · เลื่อน stage / เปิดงาน = owner/manager/staff

import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPANIES, STAGES, type Company, type Stage } from "./types";
import { STAGE_LABELS, STAGE_MILESTONE_FIELD } from "./stage";
import { listInvestors } from "./capital";
import { MODULE_KEY } from "./notify";

export type CmdReply = { text: string } | { flex: unknown; altText: string } | null;

/** ชนิดรายการที่รอยืนยัน — ตรงกับ CHECK ของ gov_procure_line_pending */
type PendingKind = "contribution" | "allocation" | "return_to_pool" | "new_order";

const fmt = (n: number) => `${new Intl.NumberFormat("th-TH").format(n)} ฿`;

// ── สิทธิ์ ───────────────────────────────────────────────────────────────────

/** module_role ของผู้ใช้ใน org นี้ — super_admin = owner */
export async function moduleRoleOf(
  admin: SupabaseClient,
  orgId: string,
  profileId: string | null,
): Promise<string | null> {
  if (!profileId) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .maybeSingle();
  if ((profile as { role?: string } | null)?.role === "super_admin") return "owner";

  const { data } = await admin
    .from("module_members")
    .select("module_role")
    .eq("org_id", orgId)
    .eq("module_key", MODULE_KEY)
    .eq("user_id", profileId)
    .eq("is_active", true)
    .maybeSingle();
  return (data as { module_role: string } | null)?.module_role ?? null;
}

const canMoney = (role: string | null) => role === "owner" || role === "manager";
const canWrite = (role: string | null) =>
  role === "owner" || role === "manager" || role === "staff";

const DENY_MONEY = "❌ คำสั่งเรื่องเงินใช้ได้เฉพาะเจ้าของ/ผู้จัดการ";
const DENY_WRITE = "❌ คุณไม่มีสิทธิ์บันทึกข้อมูลในโมดูลนี้";

// ── ตัวช่วยจับคู่ค่า ─────────────────────────────────────────────────────────

function parseAmount(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** จับคู่ชื่อบริษัทแบบหลวม ๆ (89 / p2p / alpha / magistats) */
function matchCompany(raw: string): Company | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  const exact = COMPANIES.find((c) => c.toLowerCase() === q);
  if (exact) return exact;
  return COMPANIES.find((c) => c.toLowerCase().includes(q) || q.includes(c.toLowerCase())) ?? null;
}

const STAGE_ALIASES: Record<string, Stage> = {
  เสนอราคา: "quotation",
  ใบเสนอราคา: "quotation",
  เซ็นสัญญา: "contracted",
  เซ็นสัญญาแล้ว: "contracted",
  สัญญา: "contracted",
  สั่งซื้อ: "procuring",
  จัดซื้อ: "procuring",
  ส่งของ: "delivered",
  ส่งของแล้ว: "delivered",
  ส่งสินค้า: "delivered",
  ส่งสินค้าแล้ว: "delivered",
  รับเช็ค: "paid",
  รับเช็คแล้ว: "paid",
  ปิดงาน: "closed",
};

function matchStage(raw: string): Stage | null {
  const q = raw.trim().toLowerCase().replace(/\s+/g, "");
  if ((STAGES as string[]).includes(q)) return q as Stage;
  return STAGE_ALIASES[q] ?? null;
}

// ── Flex ยืนยัน (header charcoal ตามคัมภีร์ line-flex-card-guide) ────────────

function confirmFlex(args: {
  title: string;
  lines: { label: string; value: string }[];
  warn?: string;
  pendingId: string;
}) {
  return {
    flex: {
      type: "bubble",
      header: {
        type: "box",
        layout: "horizontal",
        backgroundColor: "#3C3B3D",
        paddingAll: "14px",
        contents: [
          { type: "text", text: args.title, color: "#ffffff", weight: "bold", size: "md" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "18px",
        contents: [
          ...args.lines.map((l) => ({
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: l.label, size: "sm", color: "#656D78", flex: 2 },
              {
                type: "text",
                text: l.value,
                size: "sm",
                color: "#1A1A1B",
                weight: "bold",
                align: "end",
                flex: 3,
                wrap: true,
              },
            ],
          })),
          { type: "separator", margin: "md" },
          {
            type: "text",
            text: args.warn ?? "ตรวจสอบให้ถูกต้องแล้วกดยืนยัน — ยังไม่ถูกบันทึกจนกว่าจะกดยืนยัน",
            size: "xxs",
            wrap: true,
            color: "#9CA3AF",
            margin: "md",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        paddingAll: "14px",
        contents: [
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "postback",
              label: "✕ ยกเลิก",
              data: "gpcancel",
              displayText: "ยกเลิก",
            },
          },
          {
            type: "button",
            style: "primary",
            color: "#3C3B3D",
            height: "sm",
            action: {
              type: "postback",
              label: "✓ ยืนยันบันทึก",
              data: `gpok:${args.pendingId}`,
              displayText: "ยืนยันบันทึก",
            },
          },
        ],
      },
    },
    altText: args.title,
  };
}

async function createPending(
  admin: SupabaseClient,
  orgId: string,
  groupId: string,
  profileId: string | null,
  kind: PendingKind,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const { data, error } = await admin
    .from("gov_procure_line_pending")
    .insert({ org_id: orgId, group_id: groupId, requested_by: profileId, kind, payload })
    .select("id")
    .single();
  if (error) {
    console.error("[gov-procure] createPending failed", error.message);
    return null;
  }
  return (data as { id: string }).id;
}

// ── /ลงขัน <ชื่อนักลงทุน> <จำนวน> ────────────────────────────────────────────

const USAGE_CONTRIB = "รูปแบบ: /ลงขัน <ชื่อนักลงทุน> <จำนวนเงิน>\nเช่น /ลงขัน Bank 60000";

export async function cmdContribution(
  admin: SupabaseClient,
  orgId: string,
  groupId: string,
  profileId: string | null,
  args: string[],
): Promise<CmdReply> {
  if (!canMoney(await moduleRoleOf(admin, orgId, profileId))) return { text: DENY_MONEY };
  if (args.length < 2) return { text: `❌ ข้อมูลไม่ครบ\n\n${USAGE_CONTRIB}` };

  const amount = parseAmount(args[args.length - 1]);
  if (amount == null)
    return { text: `❌ "${args[args.length - 1]}" ไม่ใช่จำนวนเงิน\n\n${USAGE_CONTRIB}` };

  const nameQuery = args.slice(0, -1).join(" ").trim().toLowerCase();
  const investors = await listInvestors(admin, orgId);
  const matches = investors.filter((i) => i.name.toLowerCase().includes(nameQuery));

  if (matches.length === 0) {
    const list = investors.map((i) => i.name).join(", ") || "ยังไม่มีนักลงทุนในระบบ";
    return { text: `❌ ไม่พบนักลงทุนชื่อ "${nameQuery}"\n\nที่มีอยู่: ${list}` };
  }
  if (matches.length > 1) {
    return { text: `❌ ชื่อ "${nameQuery}" ตรงหลายคน: ${matches.map((m) => m.name).join(", ")}` };
  }

  const investor = matches[0];
  const today = new Date().toISOString().slice(0, 10);
  const pendingId = await createPending(admin, orgId, groupId, profileId, "contribution", {
    investor_id: investor.id,
    investor_name: investor.name,
    amount,
    flow_date: today,
  });
  if (!pendingId) return { text: "❌ ระบบขัดข้อง ลองใหม่อีกครั้ง" };

  return confirmFlex({
    title: "💰 ยืนยันบันทึกเงินลงขัน",
    lines: [
      { label: "นักลงทุน", value: `${investor.name} (${investor.share_pct}%)` },
      { label: "จำนวนเงิน", value: fmt(amount) },
      { label: "วันที่", value: today },
    ],
    warn: "เงินลงขันจะถูกบันทึกเป็นเงินต้นค้างคืนของนักลงทุนคนนี้ · ยังไม่บันทึกจนกว่าจะกดยืนยัน",
    pendingId,
  });
}

// ── /กระจายทุน <บริษัท> <จำนวน> · /คืนทุน <บริษัท> <จำนวน> ───────────────────

const USAGE_MOVE: Record<"allocation" | "return_to_pool", string> = {
  allocation: "รูปแบบ: /กระจายทุน <บริษัท> <จำนวนเงิน>\nเช่น /กระจายทุน 89 45000",
  return_to_pool: "รูปแบบ: /คืนทุน <บริษัท> <จำนวนเงิน>\nเช่น /คืนทุน p2p 20000",
};

/** ย้ายเงินระหว่างกองกลาง ↔ บริษัท (เรื่องเงิน → ต้องกดยืนยัน) */
export async function cmdMoveCapital(
  admin: SupabaseClient,
  orgId: string,
  groupId: string,
  profileId: string | null,
  kind: "allocation" | "return_to_pool",
  args: string[],
): Promise<CmdReply> {
  if (!canMoney(await moduleRoleOf(admin, orgId, profileId))) return { text: DENY_MONEY };

  const usage = USAGE_MOVE[kind];
  if (args.length < 2) return { text: `❌ ข้อมูลไม่ครบ\n\n${usage}` };

  const amount = parseAmount(args[args.length - 1]);
  if (amount == null) return { text: `❌ "${args[args.length - 1]}" ไม่ใช่จำนวนเงิน\n\n${usage}` };

  const companyRaw = args.slice(0, -1).join(" ");
  const company = matchCompany(companyRaw);
  if (!company)
    return { text: `❌ ไม่รู้จักบริษัท "${companyRaw}"\n\nบริษัท: ${COMPANIES.join(" · ")}` };

  const today = new Date().toISOString().slice(0, 10);
  const pendingId = await createPending(admin, orgId, groupId, profileId, kind, {
    company,
    amount,
    flow_date: today,
  });
  if (!pendingId) return { text: "❌ ระบบขัดข้อง ลองใหม่อีกครั้ง" };

  const isOut = kind === "allocation";
  return confirmFlex({
    title: isOut ? "🏢 ยืนยันกระจายทุนไปบริษัท" : "↩️ ยืนยันคืนทุนเข้ากองกลาง",
    lines: [
      { label: "จาก", value: isOut ? "กองกลาง" : company },
      { label: "ไปยัง", value: isOut ? company : "กองกลาง" },
      { label: "จำนวนเงิน", value: fmt(amount) },
      { label: "วันที่", value: today },
    ],
    warn: isOut
      ? "เงินจะถูกย้ายออกจากกองกลางไปเป็นทุนของบริษัทนี้ · ยังไม่บันทึกจนกว่าจะกดยืนยัน"
      : "เงินจะถูกย้ายจากบริษัทกลับเข้ากองกลาง (ไม่ใช่การปันผล) · ยังไม่บันทึกจนกว่าจะกดยืนยัน",
    pendingId,
  });
}

// ── /สถานะ <QT> <สถานะ> ──────────────────────────────────────────────────────

const USAGE_STAGE =
  "รูปแบบ: /สถานะ <เลขที่ QT> <สถานะ>\nเช่น /สถานะ QT2026060001 ส่งของแล้ว\n\nสถานะที่ใช้ได้: เสนอราคา · เซ็นสัญญา · สั่งซื้อ · ส่งของ · รับเช็ค · ปิดงาน";

export async function cmdStage(
  admin: SupabaseClient,
  orgId: string,
  profileId: string | null,
  args: string[],
): Promise<CmdReply> {
  if (!canWrite(await moduleRoleOf(admin, orgId, profileId))) return { text: DENY_WRITE };
  if (args.length < 2) return { text: `❌ ข้อมูลไม่ครบ\n\n${USAGE_STAGE}` };

  const qt = args[0].trim();
  const stage = matchStage(args.slice(1).join(" "));
  if (!stage) return { text: `❌ ไม่รู้จักสถานะ "${args.slice(1).join(" ")}"\n\n${USAGE_STAGE}` };

  const { data: rows } = await admin
    .from("gov_procure_orders")
    .select("id, qt_reference, product_description, stage")
    .eq("org_id", orgId)
    .ilike("qt_reference", `%${qt}%`)
    .limit(5);

  const orders = (rows ?? []) as {
    id: string;
    qt_reference: string | null;
    product_description: string | null;
    stage: Stage;
  }[];

  if (orders.length === 0) return { text: `❌ ไม่พบงานที่มีเลขที่ "${qt}"` };
  if (orders.length > 1) {
    return {
      text: `❌ "${qt}" ตรงหลายงาน:\n${orders.map((o) => `• ${o.qt_reference}`).join("\n")}\n\nระบุเลขที่ให้ครบ`,
    };
  }

  const order = orders[0];
  if (order.stage === stage) {
    return { text: `งาน ${order.qt_reference} อยู่ที่สถานะ "${STAGE_LABELS[stage]}" อยู่แล้ว` };
  }

  const patch: Record<string, unknown> = { stage, stage_manual_override: true };
  const milestone = STAGE_MILESTONE_FIELD[stage];
  if (milestone) patch[milestone as string] = new Date().toISOString().slice(0, 10);

  const { error } = await admin
    .from("gov_procure_orders")
    .update(patch)
    .eq("id", order.id)
    .eq("org_id", orgId);
  if (error) return { text: `❌ บันทึกไม่สำเร็จ: ${error.message}` };

  return {
    text: [
      "✅ เปลี่ยนสถานะแล้ว",
      "",
      `${order.qt_reference ?? ""} ${order.product_description ?? ""}`.trim(),
      `${STAGE_LABELS[order.stage]} → ${STAGE_LABELS[stage]}`,
    ].join("\n"),
  };
}

// ── /งานใหม่ <บริษัท> | <หน่วยงาน> | <รายการ> | <ราคา> ───────────────────────

const USAGE_NEW =
  "รูปแบบ: /งานใหม่ <บริษัท> | <กอง/หน่วยงาน> | <รายการ> | <ราคารวม VAT>\n" +
  "เช่น /งานใหม่ 89 | กองคลัง | ตู้เอกสาร 5 ตู้ | 45000\n\n" +
  `บริษัท: ${COMPANIES.join(" · ")}`;

export async function cmdNewOrder(
  admin: SupabaseClient,
  orgId: string,
  groupId: string,
  profileId: string | null,
  rest: string,
): Promise<CmdReply> {
  if (!canWrite(await moduleRoleOf(admin, orgId, profileId))) return { text: DENY_WRITE };

  const parts = rest.split("|").map((p) => p.trim());
  if (parts.length < 3) return { text: `❌ ข้อมูลไม่ครบ\n\n${USAGE_NEW}` };

  const company = matchCompany(parts[0]);
  if (!company) return { text: `❌ ไม่รู้จักบริษัท "${parts[0]}"\n\n${USAGE_NEW}` };

  const department = parts[1] || null;
  const product = parts[2];
  if (!product) return { text: `❌ ยังไม่ระบุรายการ\n\n${USAGE_NEW}` };

  const price = parts[3] ? parseAmount(parts[3]) : null;
  if (parts[3] && price == null)
    return { text: `❌ "${parts[3]}" ไม่ใช่จำนวนเงิน\n\n${USAGE_NEW}` };

  // ชื่อหน่วยงานผู้ซื้อ — ใช้ค่าที่ใช้บ่อยที่สุดใน org (งานทั้งพอร์ตเป็นเทศบาลเดียว)
  const { data: sample } = await admin
    .from("gov_procure_orders")
    .select("customer_name")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();
  const customerName = (sample as { customer_name: string } | null)?.customer_name ?? "—";

  const pendingId = await createPending(admin, orgId, groupId, profileId, "new_order", {
    company,
    department,
    product_description: product,
    price_incl_vat: price,
    customer_name: customerName,
  });
  if (!pendingId) return { text: "❌ ระบบขัดข้อง ลองใหม่อีกครั้ง" };

  return confirmFlex({
    title: "📄 ยืนยันเปิดงานใหม่",
    lines: [
      { label: "บริษัทรับงาน", value: company },
      { label: "หน่วยงาน", value: department ? `${customerName} · ${department}` : customerName },
      { label: "รายการ", value: product },
      { label: "ยอดเสนอราคา", value: price != null ? fmt(price) : "ยังไม่ระบุ" },
    ],
    warn: "งานใหม่จะถูกสร้างที่สถานะ “เสนอราคา” · เลขที่ QT และรายละเอียดอื่นเพิ่มได้ทีหลังบนเว็บ",
    pendingId,
  });
}

// ── ยืนยัน (postback gpok:<id>) ──────────────────────────────────────────────

export async function confirmPending(
  admin: SupabaseClient,
  pendingId: string,
  groupId: string,
  profileId: string | null,
): Promise<string> {
  const { data } = await admin
    .from("gov_procure_line_pending")
    .select("*")
    .eq("id", pendingId)
    .maybeSingle();

  const pending = data as {
    id: string;
    org_id: string;
    group_id: string;
    kind: PendingKind;
    payload: Record<string, unknown>;
    expires_at: string;
    consumed_at: string | null;
  } | null;

  if (!pending) return "❌ ไม่พบรายการที่รอยืนยัน";
  if (pending.group_id !== groupId) return "❌ รายการนี้ไม่ได้มาจากกลุ่มนี้";
  if (pending.consumed_at) return "รายการนี้ถูกบันทึกไปแล้ว";
  if (new Date(pending.expires_at).getTime() < Date.now())
    return "❌ รายการหมดอายุแล้ว (เกิน 15 นาที) — พิมพ์คำสั่งใหม่อีกครั้ง";

  // เช็คสิทธิ์ "คนกดยืนยัน" ซ้ำอีกครั้ง (อาจเป็นคนละคนกับคนพิมพ์)
  const role = await moduleRoleOf(admin, pending.org_id, profileId);
  const isMoney = pending.kind !== "new_order";
  const allowed = isMoney ? canMoney(role) : canWrite(role);
  if (!allowed) return isMoney ? DENY_MONEY : DENY_WRITE;

  // กันกดซ้ำแบบ atomic — ใครอัปเดตติดคนแรกได้สิทธิ์บันทึก
  const { data: claimed } = await admin
    .from("gov_procure_line_pending")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", pendingId)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return "รายการนี้ถูกบันทึกไปแล้ว";

  const p = pending.payload;

  if (pending.kind !== "new_order") {
    const { error } = await admin.from("gov_procure_capital_flows").insert({
      org_id: pending.org_id,
      created_by: profileId,
      flow_type: pending.kind,
      amount: Number(p.amount),
      flow_date: String(p.flow_date),
      investor_id: pending.kind === "contribution" ? String(p.investor_id) : null,
      company: pending.kind === "contribution" ? null : String(p.company),
      note: "บันทึกผ่าน LINE กลุ่มทีมงาน",
    });
    if (error) {
      await admin
        .from("gov_procure_line_pending")
        .update({ consumed_at: null })
        .eq("id", pendingId);
      return `❌ บันทึกไม่สำเร็จ: ${error.message}`;
    }
    if (pending.kind === "contribution")
      return `✅ บันทึกเงินลงขันแล้ว\n\n${p.investor_name} · ${fmt(Number(p.amount))}`;
    return pending.kind === "allocation"
      ? `✅ กระจายทุนแล้ว\n\nกองกลาง → ${p.company} · ${fmt(Number(p.amount))}`
      : `✅ คืนทุนเข้ากองกลางแล้ว\n\n${p.company} → กองกลาง · ${fmt(Number(p.amount))}`;
  }

  // new_order
  const { data: maxRow } = await admin
    .from("gov_procure_orders")
    .select("seq_no")
    .eq("org_id", pending.org_id)
    .order("seq_no", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const nextSeq = ((maxRow as { seq_no: number | null } | null)?.seq_no ?? 0) + 1;

  const { error } = await admin.from("gov_procure_orders").insert({
    org_id: pending.org_id,
    created_by: profileId,
    seq_no: nextSeq,
    customer_name: String(p.customer_name),
    department: p.department ? String(p.department) : null,
    company: String(p.company),
    product_description: String(p.product_description),
    price_incl_vat: p.price_incl_vat != null ? Number(p.price_incl_vat) : null,
    start_date: new Date().toISOString().slice(0, 10),
    stage: "quotation",
    notes: "เปิดงานผ่าน LINE กลุ่มทีมงาน",
  });
  if (error) {
    await admin.from("gov_procure_line_pending").update({ consumed_at: null }).eq("id", pendingId);
    return `❌ เปิดงานไม่สำเร็จ: ${error.message}`;
  }

  return [
    "✅ เปิดงานใหม่แล้ว (สถานะ: เสนอราคา)",
    "",
    `ลำดับที่ ${nextSeq} · ${p.company}`,
    String(p.product_description),
    p.price_incl_vat != null ? fmt(Number(p.price_incl_vat)) : "ยังไม่ระบุราคา",
  ].join("\n");
}
