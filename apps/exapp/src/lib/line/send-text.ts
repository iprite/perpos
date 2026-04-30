export type LineSendResult = { ok: true } | { ok: false; error: string; status?: number };

async function callLineApi(url: string, body: unknown): Promise<LineSendResult> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  if (!accessToken) return { ok: false, error: "LINE access token not configured" };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch((e: any) => {
    return { ok: false, status: 0, json: null as any, text: String(e?.message ?? "network_error") } as any;
  });

  if (!res || typeof (res as any).ok !== "boolean") {
    return { ok: false, error: "network_error", status: 0 };
  }

  if ((res as Response).ok) return { ok: true };
  const status = (res as Response).status;
  const text = await (res as Response).text().catch(() => "");
  return { ok: false, error: text || `line_api_error_${status}`, status };
}

export async function sendLineText(args: { to: string | string[]; text: string }): Promise<LineSendResult> {
  const text = String(args.text ?? "").trim();
  if (!text) return { ok: false, error: "Missing text" };

  if (Array.isArray(args.to)) {
    const to = args.to.filter((x) => typeof x === "string" && x.trim().length).map((x) => x.trim());
    if (!to.length) return { ok: false, error: "Missing recipients" };
    return callLineApi("https://api.line.me/v2/bot/message/multicast", {
      to,
      messages: [{ type: "text", text }],
    });
  }

  const to = String(args.to ?? "").trim();
  if (!to) return { ok: false, error: "Missing recipient" };
  return callLineApi("https://api.line.me/v2/bot/message/push", {
    to,
    messages: [{ type: "text", text }],
  });
}

