import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

export interface SendEmailOpts {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  constructor(private readonly config: ConfigService) {}
  async sendEmail(opts: SendEmailOpts): Promise<{ ok: boolean; reason?: string }> {
    const cfg = this.getSmtpConfig();
    if (!cfg) return { ok: false, reason: 'missing_smtp_env' };

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });

    try {
      await transporter.sendMail({ from: cfg.from, ...opts });
      return { ok: true };
    } catch {
      return { ok: false, reason: 'send_failed' };
    }
  }

  buildAuthLinkEmail(opts: {
    title: string;
    actionLabel: string;
    actionLink: string;
  }): { html: string; text: string } {
    const title = this.escapeHtml(opts.title);
    const actionLabel = this.escapeHtml(opts.actionLabel);
    const actionLinkEscaped = this.escapeAttr(opts.actionLink);
    const actionLinkVisible = this.escapeHtml(opts.actionLink);

    const html = `<!doctype html>
<html lang="th">
  <head><meta charset="utf-8" /><title>${title}</title></head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;">
        <div style="font-size:18px;font-weight:700;color:#111827;">${title}</div>
        <div style="margin-top:10px;font-size:14px;line-height:20px;color:#374151;">กดปุ่มด้านล่างเพื่อดำเนินการต่อ</div>
        <div style="margin-top:16px;">
          <a href="${actionLinkEscaped}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:10px;font-size:14px;">${actionLabel}</a>
        </div>
        <div style="margin-top:16px;font-size:12px;color:#6b7280;">
          หากปุ่มใช้งานไม่ได้ ให้คัดลอกลิงก์นี้:<br /><span style="word-break:break-all;">${actionLinkVisible}</span>
        </div>
      </div>
    </div>
  </body>
</html>`;

    return { html, text: `${opts.title}\n\n${opts.actionLabel}: ${opts.actionLink}` };
  }

  private getSmtpConfig() {
    const host = this.config.get<string>('SMTP_HOST') ?? '';
    const portRaw = this.config.get<string>('SMTP_PORT') ?? '';
    const user = this.config.get<string>('SMTP_USER') ?? '';
    const pass = this.config.get<string>('SMTP_PASSWORD') ?? '';
    const from = this.config.get<string>('SMTP_FROM_EMAIL') ?? '';
    if (!host || !portRaw || !user || !pass || !from) return null;
    const port = Number(portRaw);
    if (!Number.isFinite(port)) return null;
    return { host, port, user, pass, from };
  }

  private escapeHtml(s: string): string {
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  private escapeAttr(s: string): string {
    return s.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  }
}
