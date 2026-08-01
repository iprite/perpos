import { recordLineUsage } from "@/lib/usage/record";

export type LineMessage =
  | { type: "text"; text: string }
  | {
      type: "flex";
      altText: string;
      contents: unknown;
    };

export type LineSendResult = { ok: true } | { ok: false; error: string; status?: number };

async function callLineApi(url: string, body: unknown): Promise<LineSendResult> {
  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? "";
  if (!accessToken) return { ok: false, error: "LINE access token not configured" };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch((e: any) => {
    return {
      ok: false,
      status: 0,
      json: null as any,
      text: String(e?.message ?? "network_error"),
    } as any;
  });

  if (!res || typeof (res as any).ok !== "boolean") {
    return { ok: false, error: "network_error", status: 0 };
  }

  if ((res as Response).ok) return { ok: true };
  const status = (res as Response).status;
  const text = await (res as Response).text().catch(() => "");
  return { ok: false, error: text || `line_api_error_${status}`, status };
}

/**
 * ส่งข้อความ LINE (push/multicast)
 *
 * `usage` = บริบทเจ้าของต้นทุน (org ไหน / ฟีเจอร์อะไร) — LINE คิดเงินตามจำนวนข้อความที่ส่งออก
 * × จำนวนผู้รับ · ไม่ส่งมาก็ยังนับ แต่จะไปกอง "ไม่ระบุองค์กร" ใน /admin/usage
 */
export async function sendLineMessages(args: {
  to: string | string[];
  messages: LineMessage[];
  usage?: { orgId?: string | null; profileId?: string | null; feature?: string };
}): Promise<LineSendResult> {
  const messages = Array.isArray(args.messages) ? args.messages : [];
  if (!messages.length) return { ok: false, error: "Missing messages" };

  if (Array.isArray(args.to)) {
    const to = args.to.filter((x) => typeof x === "string" && x.trim().length).map((x) => x.trim());
    if (!to.length) return { ok: false, error: "Missing recipients" };
    const result = await callLineApi("https://api.line.me/v2/bot/message/multicast", {
      to,
      messages,
    });
    if (result.ok) {
      void recordLineUsage(args.usage ?? {}, {
        messages: messages.length,
        recipients: to.length,
        kind: "multicast",
      });
    }
    return result;
  }

  const to = String(args.to ?? "").trim();
  if (!to) return { ok: false, error: "Missing recipient" };
  const result = await callLineApi("https://api.line.me/v2/bot/message/push", {
    to,
    messages,
  });
  if (result.ok) {
    void recordLineUsage(args.usage ?? {}, { messages: messages.length, kind: "push" });
  }
  return result;
}
