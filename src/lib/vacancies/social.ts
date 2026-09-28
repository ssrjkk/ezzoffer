import type { Vacancy, VacancyFetchResult, VacancyProvider, VacancyQuery } from "./types";
import { sanitizeExternalUrl } from "./util";

const FETCH_TIMEOUT = 25_000;

/**
 * Провайдеры, требующие API-ключей. Код реальный (реальные API-запросы),
 * но без ключей честно сообщают «не настроено» через isAvailable() === false.
 * Никакой симуляции данных.
 */

// ---------------------------------------------------------------------------
// X / Twitter — нужен Bearer-токен. Без него честно недоступен.
// ---------------------------------------------------------------------------

type XRaw = {
  data?: XTweet[];
};

type XTweet = {
  id?: string;
  text?: string;
  edit_history_tweet_ids?: string[];
};

function extractXJob(raw: XTweet): Vacancy | null {
  const text = raw.text ?? "";
  if (!/(hiring|vacan|ваканс|join us|job|position|role|опен)/iu.test(text)) return null;
  // Вытаскиваем заголовок.
  const firstLine = text.split("\n")[0]?.trim() ?? text.slice(0, 80).trim() ?? "Вакансия";
  const title = firstLine.length > 100 ? `${firstLine.slice(0, 97)}…` : firstLine || "Вакансия";
  return {
    slug: `x-${raw.id ?? text.slice(0, 32)}`,
    source: "x",
    source_id: raw.id ?? text.slice(0, 32),
    title,
    company: "X / Twitter",
    salary: "по договорённости",
    salary_min: null,
    salary_max: null,
    level: "Middle",
    format: "Удалённо",
    city: "Remote",
    posted: "сегодня",
    category: "Работа",
    about: text.substring(0, 2000) || "Описание в твите.",
    responsibilities: [],
    requirements: [],
    bonus: [],
    source_url: raw.id
      ? sanitizeExternalUrl(`https://x.com/i/web/status/${raw.id}`)
      : null,
    contact_email: null,
    contact_phone: null,
  };
}

function getXToken(): string {
  return process.env.X_API_BEARER_TOKEN?.trim() ?? "";
}

export const xProvider: VacancyProvider = {
  source: "x",
  label: "X (Twitter)",
  isAvailable: () => Boolean(getXToken()),
  async fetchVacancies(query: VacancyQuery): Promise<VacancyFetchResult> {
    const token = getXToken();
    if (!token) return { vacancies: [], provider: "x", ok: false, error: "X_API_BEARER_TOKEN не настроен" };

    const q = buildSearchQuery(query);
    const params = new URLSearchParams({
      query: q,
      max_results: "20",
      "tweet.fields": "text,id,created_at",
      "user.fields": "name,username",
      expansions: "author_id",
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params.toString()}`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) return { vacancies: [], provider: "x", ok: false, error: `HTTP ${res.status}` };
      const data = (await res.json()) as XRaw;
      const vacancies = (data.data ?? []).map(extractXJob).filter((v): v is Vacancy => Boolean(v));
      const limit = Math.min(Math.max(1, query.limit ?? 20), 50);
      return { vacancies: vacancies.slice(0, limit), provider: "x", ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "network error";
      return { vacancies: [], provider: "x", ok: false, error: msg };
    } finally {
      clearTimeout(timer);
    }
  },
};

function buildSearchQuery(query: VacancyQuery): string {
  const parts = ["(hiring OR vacan OR \"join us\" OR ваканс) (lang:ru OR lang:en)"];
  if (query.text) parts.push(query.text);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Telegram-каналы компаний — нужен Bot Token и членство в каналах.
// Реальный подход: бот подписан на каналы, парсер читает публичные посты
// через Bot API (updates) либо t.me/s/ превью. Без токена — не настроено.
// ---------------------------------------------------------------------------

function getTgToken(): string {
  return process.env.TELEGRAM_SOURCE_BOT_TOKEN?.trim() ?? "";
}

function getTgChannels(): string[] {
  return (process.env.TELEGRAM_SOURCE_CHANNELS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^@/, ""))
    .filter(Boolean);
}

export function tgChannelsConfigured(): boolean {
  return Boolean(getTgToken()) && getTgChannels().length > 0;
}

type TgMessage = {
  message?: {
    message_id?: number;
    text?: string;
    chat?: { title?: string };
  };
};

function extractTgJob(raw: TgMessage): Vacancy | null {
  const text = raw.message?.text ?? "";
  if (!text) return null;
  if (!/(hiring|ваканс|job|position|role|опен|ищем|join our team)/iu.test(text)) return null;
  const title = text.split("\n")[0]?.slice(0, 100)?.trim() || "Вакансия";
  return {
    slug: `tg-${raw.message?.message_id ?? text.slice(0, 32)}`,
    source: "tg",
    source_id: String(raw.message?.message_id ?? text.slice(0, 32)),
    title,
    company: raw.message?.chat?.title ?? "Telegram-канал",
    salary: "по договорённости",
    salary_min: null,
    salary_max: null,
    level: "Middle",
    format: "В офисе",
    city: "",
    posted: "сегодня",
    category: "Работа",
    about: text.substring(0, 2000),
    responsibilities: [],
    requirements: [],
    bonus: [],
    source_url: null,
    contact_email: null,
    contact_phone: null,
  };
}

export const tgProvider: VacancyProvider = {
  source: "tg",
  label: "Каналы компаний (Telegram)",
  isAvailable: () => tgChannelsConfigured(),
  async fetchVacancies(query: VacancyQuery): Promise<VacancyFetchResult> {
    const token = getTgToken();
    const channels = getTgChannels();
    if (!token || channels.length === 0) {
      return { vacancies: [], provider: "tg", ok: false, error: "TELEGRAM_SOURCE_BOT_TOKEN / TELEGRAM_SOURCE_CHANNELS не настроены" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=50&timeout=0`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) return { vacancies: [], provider: "tg", ok: false, error: `HTTP ${res.status}` };
      const data = (await res.json()) as { result?: TgMessage[] };
      const pool = channels.map((c) => `@${c}`.toLowerCase());
      const rows = (data.result ?? []).filter((m) => {
        const chat = m.message?.chat?.title ?? "";
        return pool.some((p) => chat.toLowerCase().includes(p.replace("@", "")));
      });
      let vacancies = rows.map(extractTgJob).filter((v): v is Vacancy => Boolean(v));
      if (query.text) {
        const t = query.text.toLowerCase();
        vacancies = vacancies.filter((v) => `${v.title} ${v.company}`.toLowerCase().includes(t));
      }
      const limit = Math.min(Math.max(1, query.limit ?? 50), 100);
      return { vacancies: vacancies.slice(0, limit), provider: "tg", ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "network error";
      return { vacancies: [], provider: "tg", ok: false, error: msg };
    } finally {
      clearTimeout(timer);
    }
  },
};