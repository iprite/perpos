export function buildAuthLinkEmail(opts: { title: string; actionLabel: string; actionLink: string }) {
  const title = escapeHtml(opts.title);
  const actionLabel = escapeHtml(opts.actionLabel);
  const actionLinkEscaped = escapeAttribute(opts.actionLink);
  const actionLinkVisible = escapeHtml(opts.actionLink);

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;">
        <div style="font-size:18px;font-weight:700;color:#111827;">${title}</div>
        <div style="margin-top:10px;font-size:14px;line-height:20px;color:#374151;">
          กดปุ่มด้านล่างเพื่อดำเนินการต่อ
        </div>
        <div style="margin-top:16px;">
          <a href="${actionLinkEscaped}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:10px;font-size:14px;">
            ${actionLabel}
          </a>
        </div>
        <div style="margin-top:16px;font-size:12px;line-height:18px;color:#6b7280;">
          หากปุ่มใช้งานไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br />
          <span style="word-break:break-all;">${actionLinkVisible}</span>
        </div>
      </div>
    </div>
  </body>
</html>`;

  return { html, text: `${opts.title}\n\n${opts.actionLabel}: ${opts.actionLink}` };
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(input: string) {
  return escapeHtml(input).replaceAll("`", "&#096;");
}

