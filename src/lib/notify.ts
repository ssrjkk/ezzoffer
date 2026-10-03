import nodemailer from "nodemailer";
import { db, type User } from "./db";
import { getVacancyBySlug } from "./vacancies";
import { logError, logInfo } from "./logger";

/**
 * Уведомления. Email-digest через SMTP (env: SMTP_HOST, SMTP_PORT, SMTP_USER,
 * SMTP_PASS, SMTP_FROM, SMTP_SECURE). Если SMTP не настроен — отправка не выполняется,
 * но сбор данных (collectDigest) работает и покрывается тестами.
 */

export type DigestData = {
  sentToday: number;
  viewed: number;
  responded: number;
  invited: number;
  activeSearches: number;
  newResponses: { title: string; company: string; response: string; note: string }[];
};

export function collectDigest(userId: number): DigestData {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const sentToday = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM applications WHERE user_id = ? AND sent_at >= ? AND withdrawn = 0",
      )
      .get(userId, start.getTime()) as { c: number }
  ).c;

  const viewed = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM applications WHERE user_id = ? AND viewed_at IS NOT NULL AND withdrawn = 0",
      )
      .get(userId) as { c: number }
  ).c;

  const responded = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM applications WHERE user_id = ? AND responded_at IS NOT NULL AND withdrawn = 0",
      )
      .get(userId) as { c: number }
  ).c;

  const invited = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM applications WHERE user_id = ? AND response = 'interview' AND withdrawn = 0",
      )
      .get(userId) as { c: number }
  ).c;

  const activeSearches = (
    db
      .prepare("SELECT COUNT(*) AS c FROM searches WHERE user_id = ? AND active = 1")
      .get(userId) as { c: number }
  ).c;

  const newResponses = (
    db
      .prepare(
        `SELECT job_slug, response, response_note FROM applications
         WHERE user_id = ? AND responded_at IS NOT NULL AND responded_at >= ? AND withdrawn = 0
         ORDER BY responded_at DESC LIMIT 20`,
      )
      .all(userId, start.getTime()) as { job_slug: string; response: string; response_note: string }[]
  )
    .map((r) => {
      const v = getVacancyBySlug(r.job_slug);
      return {
        title: v?.title ?? r.job_slug,
        company: v?.company ?? "",
        response: r.response,
        note: r.response_note,
      };
    })
    .filter((r) => r.response);

  return { sentToday, viewed, responded, invited, activeSearches, newResponses };
}

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
}

export async function sendDigestEmail(userId: number): Promise<boolean> {
  if (!smtpConfigured()) return false;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as User | undefined;
  if (!user?.email) return false;

  const d = collectDigest(userId);
  const lines = [
    "Отчёт по поиску работы (EZOffer)",
    "",
    `Отправлено сегодня: ${d.sentToday}`,
    `Просмотрено резюме: ${d.viewed}`,
    `Ответов HR: ${d.responded}`,
    `Приглашений: ${d.invited}`,
    `Активных поисков: ${d.activeSearches}`,
  ];
  if (d.newResponses.length) {
    lines.push("", "Новые ответы за сегодня:");
    for (const r of d.newResponses) {
      lines.push(`- ${r.title} (${r.company}): ${r.note || r.response}`);
    }
  }
  return sendEmail(user.email, "EZOffer — отчёт по поиску", lines.join("\n"));
}

/**
 * Рассылка дневных отчётов всем пользователям с активным тарифом.
 * Отправляет максимум один digest в сутки на пользователя.
 */
export async function runDailyDigests(): Promise<number> {
  if (!smtpConfigured()) return 0;
  const users = db.prepare("SELECT * FROM users").all() as User[];
  let sent = 0;
  const dayKey = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  for (const user of users) {
    const last = (
      db
        .prepare("SELECT value FROM meta WHERE key = ?")
        .get(`digest:${user.id}`) as { value: string } | undefined
    )?.value;
    if (last === String(dayKey)) continue;
    const ok = await sendDigestEmail(user.id);
    if (ok) {
      db.prepare(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(`digest:${user.id}`, String(dayKey));
      sent++;
    }
  }
  return sent;
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const link = `${appBaseUrl()}/api/auth/verify-email?token=${token}`;
  const text = [
    "Добро пожаловать в EZOffer!",
    "",
    "Перейдите по ссылке, чтобы подтвердить email:",
    link,
    "",
    "Ссылка действует 24 часа.",
  ].join("\n");
  return sendEmail(email, "EZOffer — подтвердите email", text);
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const link = `${appBaseUrl()}/api/auth/reset-password?token=${token}`;
  const text = [
    "Сброс пароля EZOffer",
    "",
    "Перейдите по ссылке, чтобы задать новый пароль:",
    link,
    "",
    "Ссылка действует 1 час. Если вы не запрашивали сброс пароля, проигнорируйте письмо.",
  ].join("\n");
  return sendEmail(email, "EZOffer — сброс пароля", text);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) return false;

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = (process.env.SMTP_SECURE ?? "").trim() === "1";
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user && pass ? { auth: { user, pass } } : {}),
  });

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
    });
    logInfo("notify", "email отправлено", { to, messageId: info.messageId });
    return true;
  } catch (e) {
    logError("notify:email", e, { to });
    return false;
  }
}

/**
 * Рассылка резюме напрямую на email компании (рекрутёра).
 * Для вакансий с contact_email (trudvsem, geekjob и др.).
 * Требует настроенного SMTP. Возвращает { ok, error? }.
 */
export async function sendResumeEmail(opts: {
  to: string;
  company: string;
  vacancyTitle: string;
  candidateName: string;
  resumeText: string;
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!smtpConfigured()) {
    return { ok: false, error: "SMTP не настроен на сервере — добавьте SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM в .env" };
  }
  const subject = `Отклик: ${opts.vacancyTitle} — ${opts.candidateName}`;
  const text = [
    `Здравствуйте!`,
    ``,
    `Отклик на вакансию «${opts.vacancyTitle}» в компании ${opts.company}.`,
    ``,
    opts.message.trim() ? opts.message.trim() : "Рассматривайте моё резюме, пожалуйста.",
    ``,
    `---`,
    `Резюме кандидата:`,
    ``,
    opts.resumeText.slice(0, 20_000),
  ].join("\n");
  const sent = await sendEmail(opts.to, subject, text);
  return sent ? { ok: true } : { ok: false, error: "Не удалось отправить email" };
}