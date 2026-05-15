import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendLineMessages } from "@/lib/line/send-messages";

const BKK = "Asia/Bangkok";

function bkkHourMin(d: Date) {
  const hour = parseInt(
    new Intl.DateTimeFormat("en", { timeZone: BKK, hour: "numeric" }).format(d),
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

const PRIORITY_LABEL: Record<string, string> = {
  low: "ต่ำ",
  medium: "ปานกลาง",
  high: "สูง",
  urgent: "ด่วนมาก",
};

// Fetch the LINE user ID for a profile
async function getLineUserId(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  profileId: string,
): Promise<string | null> {
  const res = await admin.from("profiles").select("line_user_id").eq("id", profileId).maybeSingle();
  return (res.data as any)?.line_user_id ?? null;
}

// 1. Send due-soon reminders (called every minute by cron)
export async function sendDueReminders(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 5 * 60 * 1000);

  const { data: tasks, error } = await admin
    .from("tasks")
    .select("id,profile_id,title,due_at,priority")
    .eq("status", "pending")
    .lte("remind_at", now.toISOString())
    .gte("remind_at", windowStart.toISOString());

  if (error || !tasks?.length) return;

  for (const task of tasks as any[]) {
    const lineUserId = await getLineUserId(admin, task.profile_id);
    if (!lineUserId) continue;

    const dueInfo = task.due_at ? `\n🕐 ${fmtDate(task.due_at)} เวลา ${fmtTime(task.due_at)}` : "";
    const pri = PRIORITY_LABEL[task.priority] ?? "";
    const text = `⏰ แจ้งเตือนงาน\n📋 ${task.title}${dueInfo}${pri ? `\n🔴 ความสำคัญ: ${pri}` : ""}`;

    await sendLineMessages({ to: lineUserId, messages: [{ type: "text", text }] });
  }
}

// 2. Daily briefing at 08:30 BKK — send today's pending tasks to each user
export async function sendDailyBriefing(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: BKK }).format(now);
  const dayStart = new Date(`${todayStr}T00:00:00+07:00`).toISOString();
  const dayEnd = new Date(`${todayStr}T23:59:59+07:00`).toISOString();

  // Get all profiles that have a LINE user ID
  const { data: profiles } = await admin
    .from("profiles")
    .select("id,line_user_id,display_name")
    .not("line_user_id", "is", null)
    .eq("is_active", true);

  if (!profiles?.length) return;

  for (const profile of profiles as any[]) {
    const lineUserId = profile.line_user_id as string;

    // Pending tasks due today
    const { data: todayTasks } = await admin
      .from("tasks")
      .select("title,due_at,priority")
      .eq("profile_id", profile.id)
      .eq("status", "pending")
      .gte("due_at", dayStart)
      .lte("due_at", dayEnd)
      .order("due_at", { ascending: true });

    // Overdue tasks (due before today, still pending)
    const { data: overdueTasks } = await admin
      .from("tasks")
      .select("title,due_at")
      .eq("profile_id", profile.id)
      .eq("status", "pending")
      .lt("due_at", dayStart);

    const name = (profile.display_name as string) || "คุณ";
    const lines: string[] = [`🌅 สวัสดีตอนเช้า ${name}!`];

    if (todayTasks?.length) {
      lines.push(`\n📋 งานวันนี้ (${todayTasks.length} รายการ):`);
      (todayTasks as any[]).forEach((t, i) => {
        const time = t.due_at ? ` ${fmtTime(t.due_at)}` : "";
        lines.push(`${i + 1}.${time} ${t.title}`);
      });
    } else {
      lines.push("\n✅ วันนี้ไม่มีงานที่กำหนดไว้");
    }

    if (overdueTasks?.length) {
      lines.push(`\n⚠️ งานค้าง (${overdueTasks.length} รายการ):`);
      (overdueTasks as any[]).forEach((t) => {
        const date = t.due_at ? fmtDate(t.due_at) : "ไม่ระบุ";
        lines.push(`• ${t.title} (กำหนด: ${date})`);
      });
    }

    lines.push("\nพิมพ์ /งาน เพื่อดูรายการทั้งหมด");

    await sendLineMessages({ to: lineUserId, messages: [{ type: "text", text: lines.join("\n") }] });
  }
}

// 3. Follow-up at 17:00 BKK — ask about tasks that passed due time but aren't done
export async function sendFollowUp(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const now = new Date();

  const { data: tasks } = await admin
    .from("tasks")
    .select("id,profile_id,title,due_at")
    .eq("status", "pending")
    .lt("due_at", now.toISOString())
    .is("follow_up_sent_at", null);

  if (!tasks?.length) return;

  const byProfile: Record<string, any[]> = {};
  for (const t of tasks as any[]) {
    if (!byProfile[t.profile_id]) byProfile[t.profile_id] = [];
    byProfile[t.profile_id].push(t);
  }

  const taskIds: string[] = [];

  for (const profileId of Object.keys(byProfile)) {
    const profileTasks: any[] = byProfile[profileId];
    const lineUserId = await getLineUserId(admin, profileId);
    if (!lineUserId) continue;

    const lines = [`🔔 ติดตามงานค้าง (${profileTasks.length} รายการ):`];
    profileTasks.forEach((t: any, i: number) => {
      lines.push(`${i + 1}. ${t.title}`);
    });
    lines.push("\nพิมพ์ /เสร็จ <เลข> เพื่อปิดงาน หรือ /เลื่อน <เลข> เพื่อเลื่อน 1 วัน");

    await sendLineMessages({ to: lineUserId, messages: [{ type: "text", text: lines.join("\n") }] });
    taskIds.push(...profileTasks.map((t: any) => t.id as string));
  }

  if (taskIds.length) {
    await admin
      .from("tasks")
      .update({ follow_up_sent_at: now.toISOString() })
      .in("id", taskIds);
  }
}

// Entry point for the scheduler cron endpoint
export async function runScheduler() {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const { hour, minute } = bkkHourMin(now);

  // Always check due reminders
  await sendDueReminders(admin);

  // Daily briefing: 08:28–08:32 BKK
  if (hour === 8 && minute >= 28 && minute <= 32) {
    await sendDailyBriefing(admin);
  }

  // Follow-up: 17:00–17:04 BKK
  if (hour === 17 && minute >= 0 && minute <= 4) {
    await sendFollowUp(admin);
  }
}
