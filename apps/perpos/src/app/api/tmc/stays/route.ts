import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { requireTmcMember } from "../_lib";
import { recordMetric } from "@/lib/metrics";

const DEFAULT_ACCOUNT_ID = "a4ee27ea-6568-4097-abd7-a91fbf4805d0"; // กสิกร ออมทรัพย์

// ── Audit log helper ──────────────────────────────────────────────────────────

async function writeAuditLog(opts: {
  orgId: string;
  stayId: string;
  action: "create" | "update" | "delete";
  actorId: string;
  actorEmail?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  note?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("tmc_stay_audit_logs").insert({
      org_id: opts.orgId,
      stay_id: opts.stayId,
      action: opts.action,
      actor_id: opts.actorId,
      actor_email: opts.actorEmail ?? null,
      old_data: opts.oldData ?? null,
      new_data: opts.newData ?? null,
      note: opts.note ?? null,
    });
  } catch {
    // audit log must never break the main flow
  }
}

// ── Finance entry helper ──────────────────────────────────────────────────────

/** สร้าง finance entry สำหรับมัดจำ */
async function createDepositFinanceEntry(opts: {
  orgId: string;
  accountId: string;
  entryDate: string;
  propertyCode: string | null;
  guestName: string;
  type: "received" | "returned";
  amount: number;
  createdBy: string;
}) {
  const admin = createAdminClient();
  const isReceived = opts.type === "received";
  const description = isReceived
    ? `รับมัดจำ – ${opts.guestName}${opts.propertyCode ? ` (${opts.propertyCode})` : ""}`
    : `คืนมัดจำ – ${opts.guestName}${opts.propertyCode ? ` (${opts.propertyCode})` : ""}`;

  await admin.from("tmc_finance_entries").insert({
    org_id: opts.orgId,
    account_id: opts.accountId,
    entry_date: opts.entryDate,
    description,
    category: isReceived ? "ค่ามัดจำ" : "คืนเงินมัดจำ",
    property_code: opts.propertyCode,
    income: isReceived ? opts.amount : null,
    expense: isReceived ? null : opts.amount,
    note: "บันทึกอัตโนมัติจากการเข้าพัก",
    created_by: opts.createdBy,
  });
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const p = req.nextUrl.searchParams;
  const orgId = p.get("orgId") ?? "";
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  let q = auth.rls
    .from("tmc_stays")
    .select(
      `
      *,
      tmc_guests(id, first_name, last_name, nickname, tel, guest_type),
      tmc_properties(id, code, name)
    `,
    )
    .eq("org_id", orgId)
    .order("check_in", { ascending: false });

  if (p.get("bookingGroupId")) q = q.eq("booking_group_id", p.get("bookingGroupId")!);
  if (p.get("propertyCode")) q = q.eq("property_code", p.get("propertyCode")!);
  if (p.get("from")) q = q.gte("check_in", p.get("from")!);
  if (p.get("to")) q = q.lte("check_in", p.get("to")!);
  if (p.get("stayType")) q = q.eq("stay_type", p.get("stayType")!);
  if (p.get("bookingChannel")) q = q.eq("booking_channel", p.get("bookingChannel")!);

  const limit = Math.min(Number(p.get("limit") ?? 200), 500);
  const offset = Number(p.get("offset") ?? 0);
  q = q.range(offset, offset + limit - 1);

  const { data, error } = await q;
  if (error) {
    void recordMetric({ orgId, route: "/api/tmc/stays", method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: "/api/tmc/stays", method: req.method, status: 200, t0 });
  return NextResponse.json(data ?? []);
}

// ── POST (create) ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  // Support either body.propertyCodes (array) or body.propertyCode (single string)
  const propertyCodes: string[] = (
    Array.isArray(body.propertyCodes)
      ? body.propertyCodes.map(String)
      : body.propertyCode
        ? [String(body.propertyCode)]
        : []
  ).filter(Boolean);

  // 1 booking ต้องระบุห้อง + ช่วงวันที่เข้าพักเสมอ — ฐานของ "คืนต่อห้อง / revenue ต่อห้อง"
  if (propertyCodes.length === 0) {
    return NextResponse.json(
      { error: "ต้องระบุห้อง/แปลงที่เข้าพักอย่างน้อย 1 ห้อง" },
      { status: 400 },
    );
  }
  const checkInStr = String(body.checkIn ?? "");
  const checkOutStr = String(body.checkOut ?? "");
  if (!checkInStr || !checkOutStr) {
    return NextResponse.json({ error: "ต้องระบุวันเช็คอินและวันเช็คเอาท์" }, { status: 400 });
  }
  if (checkOutStr <= checkInStr) {
    return NextResponse.json(
      { error: "วันเช็คเอาท์ต้องอยู่หลังวันเช็คอิน (อย่างน้อย 1 คืน)" },
      { status: 400 },
    );
  }

  // Resolve property codes to IDs
  const { data: props } = await admin
    .from("tmc_properties")
    .select("id, code")
    .eq("org_id", orgId)
    .in("code", propertyCodes);

  const propMap = new Map<string, string>();
  props?.forEach((p) => propMap.set(p.code, p.id));

  // Upsert guest
  let guestId = (body.guestId as string | null) ?? null;
  let guestName = "";
  if (!guestId && body.firstName) {
    const tel = String(body.tel ?? "");
    const firstName = String(body.firstName ?? "");
    const lastName = String(body.lastName ?? "");
    guestName = [body.nickname || firstName, lastName].filter(Boolean).join(" ").trim();

    const { data: existing } = tel
      ? await admin.from("tmc_guests").select("id").eq("org_id", orgId).eq("tel", tel).maybeSingle()
      : { data: null };

    if (existing?.id) {
      guestId = existing.id;
      // Update guest info in case details changed
      await admin
        .from("tmc_guests")
        .update({
          first_name: firstName,
          last_name: lastName || null,
          nickname: body.nickname ? String(body.nickname) : null,
          tel: tel || null,
        })
        .eq("id", existing.id);
    } else {
      const { data: newGuest, error: guestErr } = await admin
        .from("tmc_guests")
        .insert({
          org_id: orgId,
          first_name: firstName,
          last_name: lastName || null,
          nickname: body.nickname ?? null,
          tel: tel || null,
          guest_type: body.stayType === "influencer" ? "influencer" : "regular",
        })
        .select("id")
        .single();
      if (guestErr) {
        // Retry lookup (race condition / unique constraint)
        const { data: retry } = tel
          ? await admin
              .from("tmc_guests")
              .select("id")
              .eq("org_id", orgId)
              .eq("tel", tel)
              .maybeSingle()
          : { data: null };
        guestId = retry?.id ?? null;
      } else {
        guestId = newGuest?.id ?? null;
      }
    }
  }

  const depositReceived = body.depositReceived ? Number(body.depositReceived) : null;
  const depositReturned = body.depositReturned ? Number(body.depositReturned) : null;
  const depositAccountId = String(body.depositAccountId || DEFAULT_ACCOUNT_ID);
  const depositReceivedDate = body.depositReceivedDate ? String(body.depositReceivedDate) : null;
  const depositReturnedDate = body.depositReturnedDate ? String(body.depositReturnedDate) : null;
  const checkIn = checkInStr;
  const checkOut = checkOutStr;

  const count = propertyCodes.length;
  const codesToInsert = propertyCodes;

  const roomRate = body.roomRate ? Number(body.roomRate) : null;
  const promotionPct = body.promotionPct ? Number(body.promotionPct) : null;
  const depositAmount = body.depositAmount ? Number(body.depositAmount) : null;

  const dividedRate = roomRate !== null ? Number((roomRate / count).toFixed(2)) : null;
  const dividedDeposit = depositAmount !== null ? Number((depositAmount / count).toFixed(2)) : null;
  const dividedReceived =
    depositReceived !== null ? Number((depositReceived / count).toFixed(2)) : null;
  const dividedReturned =
    depositReturned !== null ? Number((depositReturned / count).toFixed(2)) : null;

  const bookingGroupId = crypto.randomUUID();
  const rows = codesToInsert.map((code, idx) => {
    const isFirst = idx === 0;
    return {
      org_id: orgId,
      booking_group_id: bookingGroupId,
      guest_id: guestId,
      property_id: code ? (propMap.get(code) ?? null) : null,
      property_code: code || null,
      check_in: checkIn,
      check_out: checkOut,
      check_in_time: body.checkInTime ?? null,
      check_out_time: body.checkOutTime ?? null,
      booking_channel: body.bookingChannel ?? null,
      stay_type: body.stayType ?? "paid",
      room_rate: dividedRate,
      promotion_pct: promotionPct,
      deposit_amount: dividedDeposit,
      deposit_received: dividedReceived,
      deposit_returned: dividedReturned,
      deposit_account_id: dividedReceived || dividedReturned ? depositAccountId : null,
      deposit_received_date: depositReceivedDate,
      deposit_returned_date: depositReturnedDate,
      group_size: body.groupSize ? Number(body.groupSize) : null,
      group_type: body.groupType ?? null,
      butler_service_visit: body.butlerServiceVisit ?? null,
      // Extra charges and notes only on first stay to avoid duplication
      food_amount: isFirst && body.foodAmount ? Number(body.foodAmount) : null,
      drink_amount: isFirst && body.drinkAmount ? Number(body.drinkAmount) : null,
      mookata_amount: isFirst && body.mookataAmount ? Number(body.mookataAmount) : null,
      bbq_amount: isFirst && body.bbqAmount ? Number(body.bbqAmount) : null,
      activity_detail: isFirst ? (body.activityDetail ?? null) : null,
      feedback: isFirst ? (body.feedback ?? null) : null,
      issues: isFirst ? (body.issues ?? null) : null,
      damaged_items: isFirst ? (body.damagedItems ?? null) : null,
      created_by: auth.userId,
    };
  });

  const { data, error } = await admin
    .from("tmc_stays")
    .insert(rows)
    .select("*, tmc_guests(id, first_name, last_name, nickname, tel)");

  if (error) {
    void recordMetric({ orgId, route: "/api/tmc/stays", method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit log and Deposit Finance Entries for each stay row
  if (data && Array.isArray(data)) {
    for (const stayRow of data) {
      void writeAuditLog({
        orgId,
        stayId: stayRow.id,
        action: "create",
        actorId: auth.userId,
        newData: stayRow as Record<string, unknown>,
      });

      const pCode = stayRow.property_code;
      const depRec = stayRow.deposit_received;
      const depRet = stayRow.deposit_returned;

      if (depRec && depRec > 0) {
        const entryDate = depositReceivedDate || checkIn;
        if (entryDate) {
          await createDepositFinanceEntry({
            orgId,
            accountId: depositAccountId,
            entryDate,
            propertyCode: pCode || null,
            guestName: guestName || "ลูกค้า",
            type: "received",
            amount: depRec,
            createdBy: auth.userId,
          });
        }
      }
      if (depRet && depRet > 0) {
        const entryDate = depositReturnedDate || checkOut || checkIn;
        if (entryDate) {
          await createDepositFinanceEntry({
            orgId,
            accountId: depositAccountId,
            entryDate,
            propertyCode: pCode || null,
            guestName: guestName || "ลูกค้า",
            type: "returned",
            amount: depRet,
            createdBy: auth.userId,
          });
        }
      }
    }
  }

  const savedData = data && data.length > 0 ? data[0] : null;

  void recordMetric({ orgId, route: "/api/tmc/stays", method: req.method, status: 201, t0 });
  return NextResponse.json(savedData, { status: 201 });
}

// ── PUT (update ทั้ง booking เป็นกลุ่ม) ──────────────────────────────────────
// 1 booking = หลายแถว (แถวละห้อง) ผูกกันด้วย booking_group_id
// แก้ครั้งเดียวทั้งกลุ่ม: เพิ่ม/ลดห้อง, เปลี่ยนวันที่, ยอดรวมถูกหารต่อห้องใหม่

export async function PUT(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "");
  const orgId = String(body.orgId ?? "");
  let bookingGroupId = String(body.bookingGroupId ?? "");
  if (!orgId || (!id && !bookingGroupId)) {
    return NextResponse.json({ error: "missing orgId or id/bookingGroupId" }, { status: 400 });
  }

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // Resolve group from row id (backward compat)
  if (!bookingGroupId && id) {
    const { data: row } = await admin
      .from("tmc_stays")
      .select("booking_group_id")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    bookingGroupId = row?.booking_group_id ?? "";
  }
  if (!bookingGroupId)
    return NextResponse.json({ error: "ไม่พบข้อมูลการเข้าพัก" }, { status: 404 });

  const { data: existingRows } = await admin
    .from("tmc_stays")
    .select("*, tmc_guests(first_name, last_name, nickname)")
    .eq("booking_group_id", bookingGroupId)
    .eq("org_id", orgId)
    .order("created_at");
  if (!existingRows || existingRows.length === 0) {
    return NextResponse.json({ error: "ไม่พบข้อมูลการเข้าพัก" }, { status: 404 });
  }
  const first = existingRows[0];

  // Validate — 1 booking ต้องระบุห้อง + ช่วงวันที่เสมอ
  const propertyCodes: string[] = (
    Array.isArray(body.propertyCodes)
      ? body.propertyCodes.map(String)
      : body.propertyCode
        ? [String(body.propertyCode)]
        : []
  ).filter(Boolean);
  if (propertyCodes.length === 0) {
    return NextResponse.json(
      { error: "ต้องระบุห้อง/แปลงที่เข้าพักอย่างน้อย 1 ห้อง" },
      { status: 400 },
    );
  }
  const checkIn = String(body.checkIn ?? first.check_in ?? "");
  const checkOut = String(body.checkOut ?? first.check_out ?? "");
  if (!checkIn || !checkOut) {
    return NextResponse.json({ error: "ต้องระบุวันเช็คอินและวันเช็คเอาท์" }, { status: 400 });
  }
  if (checkOut <= checkIn) {
    return NextResponse.json(
      { error: "วันเช็คเอาท์ต้องอยู่หลังวันเช็คอิน (อย่างน้อย 1 คืน)" },
      { status: 400 },
    );
  }

  // Resolve property codes → ids
  const { data: props } = await admin
    .from("tmc_properties")
    .select("id, code")
    .eq("org_id", orgId)
    .in("code", propertyCodes);
  const propMap = new Map<string, string>();
  props?.forEach((p) => propMap.set(p.code, p.id));

  // Update guest info if firstName provided
  if (first.guest_id && body.firstName) {
    await admin
      .from("tmc_guests")
      .update({
        first_name: String(body.firstName ?? ""),
        last_name: body.lastName ? String(body.lastName) : null,
        nickname: body.nickname ? String(body.nickname) : null,
        tel: body.tel ? String(body.tel) : null,
      })
      .eq("id", first.guest_id);
  }
  const g = first.tmc_guests as {
    first_name?: string;
    last_name?: string | null;
    nickname?: string | null;
  } | null;
  const guestName = body.firstName
    ? ([body.nickname || body.firstName, body.lastName].filter(Boolean).join(" ").trim() as string)
    : (g?.nickname ?? [g?.first_name, g?.last_name].filter(Boolean).join(" ").trim() ?? "ลูกค้า");

  // ยอดที่กรอกเป็น "ยอดรวมทั้ง booking" → หารเท่ากันต่อห้อง (ท่าเดียวกับตอนสร้าง)
  const count = propertyCodes.length;
  const roomRate = body.roomRate ? Number(body.roomRate) : null;
  const depositAmount = body.depositAmount ? Number(body.depositAmount) : null;
  const depositReceived = body.depositReceived ? Number(body.depositReceived) : null;
  const depositReturned = body.depositReturned ? Number(body.depositReturned) : null;
  const depositAccountId = String(body.depositAccountId || DEFAULT_ACCOUNT_ID);
  const depositReceivedDate = body.depositReceivedDate ? String(body.depositReceivedDate) : null;
  const depositReturnedDate = body.depositReturnedDate ? String(body.depositReturnedDate) : null;

  const div = (v: number | null) => (v !== null ? Number((v / count).toFixed(2)) : null);
  const sharedPatch = {
    check_in: checkIn,
    check_out: checkOut,
    check_in_time: body.checkInTime ?? first.check_in_time,
    check_out_time: body.checkOutTime ?? first.check_out_time,
    booking_channel: body.bookingChannel ?? null,
    stay_type: body.stayType ?? "paid",
    room_rate: div(roomRate),
    promotion_pct: body.promotionPct ? Number(body.promotionPct) : null,
    // deposit_amount แตะเฉพาะเมื่อ client ส่งมา (ฟอร์มปัจจุบันไม่มีช่องนี้ — อย่า null ทับของเดิม)
    ...(body.depositAmount !== undefined ? { deposit_amount: div(depositAmount) } : {}),
    deposit_received: div(depositReceived),
    deposit_returned: div(depositReturned),
    deposit_account_id: depositReceived || depositReturned ? depositAccountId : null,
    deposit_received_date: depositReceivedDate,
    deposit_returned_date: depositReturnedDate,
    group_size: body.groupSize ? Number(body.groupSize) : null,
    group_type: body.groupType ?? null,
    butler_service_visit: body.butlerServiceVisit ?? null,
  };
  // ของที่ลงครั้งเดียวต่อ booking — เก็บไว้ที่ห้องแรกของรายการใหม่เท่านั้น
  const extrasFor = (isFirst: boolean) => ({
    food_amount: isFirst && body.foodAmount ? Number(body.foodAmount) : null,
    drink_amount: isFirst && body.drinkAmount ? Number(body.drinkAmount) : null,
    mookata_amount: isFirst && body.mookataAmount ? Number(body.mookataAmount) : null,
    bbq_amount: isFirst && body.bbqAmount ? Number(body.bbqAmount) : null,
    activity_detail: isFirst ? (body.activityDetail ?? null) : null,
    feedback: isFirst ? (body.feedback ?? null) : null,
    issues: isFirst ? (body.issues ?? null) : null,
    damaged_items: isFirst ? (body.damagedItems ?? null) : null,
  });

  // Reconcile: แถวเดิมจับคู่ตาม property_code — เหลือ = update, หายไป = delete, ใหม่ = insert
  const remaining = new Map<string, Record<string, unknown>>();
  const toDelete: Record<string, unknown>[] = [];
  for (const row of existingRows) {
    const code = String(row.property_code);
    if (propertyCodes.includes(code) && !remaining.has(code)) remaining.set(code, row);
    else toDelete.push(row);
  }

  // มัดจำ (delta ระดับกลุ่ม) — คิดก่อนแก้ข้อมูล
  const prevReceived = existingRows.reduce((s, r) => s + Number(r.deposit_received ?? 0), 0);
  const prevReturned = existingRows.reduce((s, r) => s + Number(r.deposit_returned ?? 0), 0);

  for (let idx = 0; idx < propertyCodes.length; idx++) {
    const code = propertyCodes[idx];
    const isFirst = idx === 0;
    const existing = remaining.get(code);
    if (existing) {
      const { data: updated, error } = await admin
        .from("tmc_stays")
        .update({ ...sharedPatch, ...extrasFor(isFirst) })
        .eq("id", existing.id as string)
        .eq("org_id", orgId)
        .select()
        .single();
      if (error) {
        void recordMetric({ orgId, route: "/api/tmc/stays", method: req.method, status: 500, t0 });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      void writeAuditLog({
        orgId,
        stayId: String(existing.id),
        action: "update",
        actorId: auth.userId,
        oldData: existing,
        newData: updated as Record<string, unknown>,
      });
    } else {
      const { data: inserted, error } = await admin
        .from("tmc_stays")
        .insert({
          org_id: orgId,
          booking_group_id: bookingGroupId,
          guest_id: first.guest_id,
          property_id: propMap.get(code) ?? null,
          property_code: code,
          created_by: auth.userId,
          ...sharedPatch,
          ...extrasFor(isFirst),
        })
        .select()
        .single();
      if (error) {
        void recordMetric({ orgId, route: "/api/tmc/stays", method: req.method, status: 500, t0 });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      void writeAuditLog({
        orgId,
        stayId: String((inserted as Record<string, unknown>).id),
        action: "create",
        actorId: auth.userId,
        newData: inserted as Record<string, unknown>,
        note: "เพิ่มห้องจากการแก้ไข booking",
      });
    }
  }

  for (const row of toDelete) {
    await writeAuditLog({
      orgId,
      stayId: String(row.id),
      action: "delete",
      actorId: auth.userId,
      oldData: row,
      note: "เอาห้องออกจากการแก้ไข booking",
    });
    const { error } = await admin
      .from("tmc_stays")
      .delete()
      .eq("id", String(row.id))
      .eq("org_id", orgId);
    if (error) {
      void recordMetric({ orgId, route: "/api/tmc/stays", method: req.method, status: 500, t0 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Finance entries เฉพาะส่วนที่ "เพิ่มขึ้น" ของยอดรวมทั้งกลุ่ม
  const newReceived = depositReceived ?? 0;
  const newReturned = depositReturned ?? 0;
  const firstCode = propertyCodes[0] ?? null;
  if (newReceived > prevReceived) {
    const entryDate = depositReceivedDate || checkIn;
    await createDepositFinanceEntry({
      orgId,
      accountId: depositAccountId,
      entryDate,
      propertyCode: firstCode,
      guestName,
      type: "received",
      amount: Number((newReceived - prevReceived).toFixed(2)),
      createdBy: auth.userId,
    });
  }
  if (newReturned > prevReturned) {
    const entryDate = depositReturnedDate || checkOut || checkIn;
    await createDepositFinanceEntry({
      orgId,
      accountId: depositAccountId,
      entryDate,
      propertyCode: firstCode,
      guestName,
      type: "returned",
      amount: Number((newReturned - prevReturned).toFixed(2)),
      createdBy: auth.userId,
    });
  }

  const { data: refreshed } = await admin
    .from("tmc_stays")
    .select("*, tmc_guests(id, first_name, last_name, nickname, tel)")
    .eq("booking_group_id", bookingGroupId)
    .eq("org_id", orgId)
    .order("created_at");

  void recordMetric({ orgId, route: "/api/tmc/stays", method: req.method, status: 200, t0 });
  return NextResponse.json(refreshed ?? []);
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const t0 = Date.now();
  const p = req.nextUrl.searchParams;
  const id = p.get("id") ?? "";
  const orgId = p.get("orgId") ?? "";
  const note = p.get("note") ?? null; // optional reason
  if (!id || !orgId) return NextResponse.json({ error: "missing id or orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!["owner", "admin", "team_lead"].includes(auth.role)) {
    return NextResponse.json({ error: "ต้องการสิทธิ์ team_lead ขึ้นไป" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Snapshot before delete (await — stay will be gone after)
  const { data: snapshot } = await admin
    .from("tmc_stays")
    .select("*, tmc_guests(first_name, last_name, nickname, tel)")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (!snapshot) return NextResponse.json({ error: "ไม่พบข้อมูลการเข้าพัก" }, { status: 404 });

  // Write audit log BEFORE delete so the stay still exists during insert
  await writeAuditLog({
    orgId,
    stayId: id,
    action: "delete",
    actorId: auth.userId,
    oldData: snapshot as Record<string, unknown>,
    note,
  });

  const { error } = await admin.from("tmc_stays").delete().eq("id", id).eq("org_id", orgId);
  if (error) {
    void recordMetric({ orgId, route: "/api/tmc/stays", method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: "/api/tmc/stays", method: req.method, status: 200, t0 });
  return NextResponse.json({ ok: true });
}
