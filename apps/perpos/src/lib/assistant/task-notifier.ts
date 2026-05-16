import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendLineMessages } from "@/lib/line/send-messages";

const BKK = "Asia/Bangkok";

function bkkHourMin(d: Date) {
  const hour = parseInt(
    new Intl.DateTimeFormat("en", { timeZone: BKK, hour: "numeric", hour12: false }).format(d),
  );
  const minute = parseInt(
    new Intl.DateTimeFormat("en", { timeZone: BKK, minute: "numeric" }).format(d),
  );
  return { hour, minute };
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: BKK,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: BKK,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function bkkDayBounds(d: Date): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BKK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d).reduce((a, p) => {
    if (p.type !== "literal") (a as any)[p.type] = p.value;
    return a;
  }, {} as Record<string, string>);
  const { year: y, month: m, day: dd } = parts;
  return {
    start: new Date(`${y}-${m}-${dd}T00:00:00+07:00`).toISOString(),
    end:   new Date(`${y}-${m}-${dd}T23:59:59+07:00`).toISOString(),
  };
}

async function getLineUserId(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  profileId: string,
): Promise<string | null> {
  const res = await admin.from("profiles").select("line_user_id").eq("id", profileId).maybeSingle();
  return (res.data as any)?.line_user_id ?? null;
}

// ─── 1. Daily task briefing at 08:00 BKK ────────────────────────────────────
// Sends every on-process (pending/in_progress) task to each user.

export async function sendDailyTaskBriefing(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const { data: profiles } = await admin
    .from("profiles")
    .select("id,line_user_id,display_name")
    .not("line_user_id", "is", null)
    .eq("is_active", true);

  if (!profiles?.length) return;

  for (const profile of profiles as any[]) {
    const lineUserId = profile.line_user_id as string;

    const { data: tasks } = await admin
      .from("tasks")
      .select("title,created_at")
      .eq("profile_id", profile.id)
      .in("status", ["pending", "in_progress"])
      .order("created_at", { ascending: true });

    const name = (profile.display_name as string) || "คุณ";
    const lines: string[] = [`🌅 สวัสดีตอนเช้า ${name}!`];

    if (tasks?.length) {
      lines.push(`\n📋 งานที่ยังค้างอยู่ (${tasks.length} รายการ):`);
      (tasks as any[]).forEach((t, i) => {
        lines.push(`${i + 1}. ${t.title}`);
      });
      lines.push("\nพิมพ์ /เสร็จ <เลข> เพื่อปิดงาน");
    } else {
      lines.push("\n✅ ไม่มีงานค้าง วันนี้ว่างเต็มที่!");
    }

    await sendLineMessages({ to: lineUserId, messages: [{ type: "text", text: lines.join("\n") }] });
  }
}

// ─── 2. Appointment reminders ────────────────────────────────────────────────
// Called every minute. Handles 3 reminder levels:
//   A) 1 day before at 08:00 BKK  → reminded_day_before
//   B) day of at 08:00 BKK        → reminded_day_of
//   C) 1 hour before               → reminded_1h_before

export async function sendAppointmentReminders(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const now = new Date();
  const { hour, minute } = bkkHourMin(now);
  const isMorningWindow = hour === 8 && minute <= 4;

  // ── A & B: morning window reminders ────────────────────────────────────
  if (isMorningWindow) {
    const today     = bkkDayBounds(now);
    const tomorrow  = bkkDayBounds(new Date(now.getTime() + 24 * 60 * 60 * 1000));

    // Day-before reminders: appointments tomorrow not yet notified
    const { data: dayBefore } = await admin
      .from("appointments")
      .select("id,profile_id,title,starts_at")
      .eq("reminded_day_before", false)
      .gte("starts_at", tomorrow.start)
      .lte("starts_at", tomorrow.end);

    for (const appt of (dayBefore ?? []) as any[]) {
      const lineUserId = await getLineUserId(admin, appt.profile_id);
      if (!lineUserId) continue;
      const text = `🔔 แจ้งเตือนล่วงหน้า 1 วัน\n📅 ${appt.title}\n🗓 ${fmtDate(appt.starts_at)} เวลา ${fmtTime(appt.starts_at)}`;
      await sendLineMessages({ to: lineUserId, messages: [{ type: "text", text }] });
      await admin.from("appointments").update({ reminded_day_before: true }).eq("id", appt.id);
    }

    // Day-of reminders: appointments today not yet notified
    const { data: dayOf } = await admin
      .from("appointments")
      .select("id,profile_id,title,starts_at")
      .eq("reminded_day_of", false)
      .gte("starts_at", today.start)
      .lte("starts_at", today.end);

    for (const appt of (dayOf ?? []) as any[]) {
      const lineUserId = await getLineUserId(admin, appt.profile_id);
      if (!lineUserId) continue;
      const text = `📅 วันนี้มีนัด!\n📌 ${appt.title}\n🕐 เวลา ${fmtTime(appt.starts_at)}`;
      await sendLineMessages({ to: lineUserId, messages: [{ type: "text", text }] });
      await admin.from("appointments").update({ reminded_day_of: true }).eq("id", appt.id);
    }
  }

  // ── C: 1-hour-before reminder (every minute check, window 55–65 min) ──
  const windowStart = new Date(now.getTime() + 55 * 60 * 1000).toISOString();
  const windowEnd   = new Date(now.getTime() + 65 * 60 * 1000).toISOString();

  const { data: upcoming } = await admin
    .from("appointments")
    .select("id,profile_id,title,starts_at")
    .eq("reminded_1h_before", false)
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd);

  for (const appt of (upcoming ?? []) as any[]) {
    const lineUserId = await getLineUserId(admin, appt.profile_id);
    if (!lineUserId) continue;
    const text = `⏰ อีก 1 ชั่วโมง มีนัด!\n📌 ${appt.title}\n🕐 เวลา ${fmtTime(appt.starts_at)}`;
    await sendLineMessages({ to: lineUserId, messages: [{ type: "text", text }] });
    await admin.from("appointments").update({ reminded_1h_before: true }).eq("id", appt.id);
  }
}

// ─── Entry point for scheduler cron ─────────────────────────────────────────

export async function runScheduler() {
  const admin = createSupabaseAdminClient();
  const now   = new Date();
  const { hour, minute } = bkkHourMin(now);

  // Appointment reminders every minute (all 3 levels handled internally)
  await sendAppointmentReminders(admin);

  // Daily task briefing at 08:00–08:04 BKK
  if (hour === 8 && minute <= 4) {
    await sendDailyTaskBriefing(admin);
  }
}
