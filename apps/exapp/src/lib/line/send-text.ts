import { sendLineMessages, type LineSendResult } from "@/lib/line/send-messages";

export async function sendLineText(args: { to: string | string[]; text: string }): Promise<LineSendResult> {
  const text = String(args.text ?? "").trim();
  if (!text) return { ok: false, error: "Missing text" };

  return sendLineMessages({ to: args.to, messages: [{ type: "text", text }] });
}
