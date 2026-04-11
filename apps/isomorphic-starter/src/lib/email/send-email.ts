import nodemailer from "nodemailer";

function getEnv(name: string) {
  return process.env[name] ?? "";
}

function getSmtpConfig() {
  const host = getEnv("SMTP_HOST");
  const portRaw = getEnv("SMTP_PORT");
  const user = getEnv("SMTP_USER");
  const pass = getEnv("SMTP_PASSWORD");
  const from = getEnv("SMTP_FROM_EMAIL");

  if (!host || !portRaw || !user || !pass || !from) return null;
  const port = Number(portRaw);
  if (!Number.isFinite(port)) return null;

  return { host, port, user, pass, from };
}

export async function sendEmail(opts: { to: string; subject: string; html: string; text?: string }) {
  const cfg = getSmtpConfig();
  if (!cfg) return { ok: false as const, reason: "missing_smtp_env" as const };

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  await transporter.sendMail({
    from: cfg.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });

  return { ok: true as const };
}

