import type { Level, WorkFormat } from "../data";
import type { Vacancy, VacancyApplyResult, VacancyFetchResult, VacancyProvider, VacancyQuery } from "./types";
import { sanitizeExternalUrl, toSalaryNumber } from "./util";

const BASE = "https://api.hh.ru/vacancies";
const FETCH_TIMEOUT = 25_000;

type HhRaw = {
  items?: HhVacancyRaw[];
};

type HhSalary = {
  from?: number | null;
  to?: number | null;
  currency?: string;
  gross?: boolean;
};

export type HhVacancyRaw = {
  id?: string;
  name?: string;
  alternate_url?: string;
  published_at?: string;
  employer?: { name?: string };
  area?: { name?: string };
  salary?: HhSalary | null;
  schedule?: { id?: string; name?: string };
  professional_roles?: { name?: string }[];
  snippet?: { requirement?: string; responsibility?: string | null };
};

function relativePosted(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "недавно";
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн. назад`;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function inferLevel(name: string): Level {
  const s = name.toLowerCase();
  if (/(стаж|intern)/.test(s)) return "Intern";
  if (/(младш|junior)/.test(s)) return "Junior";
  if (/(ведущ|senior|старш|principal|lead)/.test(s)) return "Senior";
  return "Middle";
}

function inferFormat(id?: string): WorkFormat {
  switch (id) {
    case "remote":
      return "Удалённо";
    case "flexible":
    case "hybrid":
    case "shift":
      return "Гибрид";
    default:
      return "В офисе";
  }
}

function salaryDisplay(s?: HhSalary | null): string {
  if (!s) return "по договорённости";
  const from = toSalaryNumber(s.from) ?? 0;
  const to = toSalaryNumber(s.to) ?? 0;
  const sym = s.currency === "RUR" || s.currency === "RUB" ? "₽" : s.currency ?? "";
  if (from > 0 && to > 0) return `${from.toLocaleString("ru-RU")}–${to.toLocaleString("ru-RU")} ${sym}`;
  if (from > 0) return `от ${from.toLocaleString("ru-RU")} ${sym}`;
  if (to > 0) return `до ${to.toLocaleString("ru-RU")} ${sym}`;
  return "по договорённости";
}

function cleanSnippet(s?: string): string {
  return (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function mapHhVacancy(raw: HhVacancyRaw): Vacancy | null {
  if (!raw.id || !raw.name) return null;
  const req = cleanSnippet(raw.snippet?.requirement);
  const resp = cleanSnippet(raw.snippet?.responsibility ?? undefined);
  return {
    slug: `hh-${raw.id}`,
    source: "hh",
    source_id: raw.id,
    title: raw.name,
    company: raw.employer?.name ?? "Компания",
    salary: salaryDisplay(raw.salary),
    salary_min: toSalaryNumber(raw.salary?.from),
    salary_max: toSalaryNumber(raw.salary?.to),
    level: inferLevel(raw.name),
    format: inferFormat(raw.schedule?.id),
    city: raw.area?.name ?? "Россия",
    posted: relativePosted(raw.published_at ?? ""),
    category: raw.professional_roles?.[0]?.name ?? "Работа",
    about: resp ? `${resp}\n\n${req}` : req || "Описание доступно на hh.ru.",
    responsibilities: resp ? [resp] : [],
    requirements: req ? [req] : [],
    bonus: [],
    source_url: sanitizeExternalUrl(raw.alternate_url),
    contact_email: null,
    contact_phone: null,
  };
}

function getToken(): string {
  return process.env.HH_ACCESS_TOKEN?.trim() ?? "";
}

export const hhProvider: VacancyProvider = {
  source: "hh",
  label: "hh.ru",
  isAvailable: () => Boolean(getToken()),
  async apply(vacancy, ctx): Promise<VacancyApplyResult> {
    // Токен из контекста (аккаунт пользователя) с фолбэком на глобальный HH_ACCESS_TOKEN.
    const token = ctx.accessToken?.trim() || getToken();
    if (!token) {
      return { ok: false, error: "HH_ACCESS_TOKEN не настроен" };
    }
    const vacancyId = /^hh-/.test(vacancy.slug) ? vacancy.slug.slice(3) : vacancy.source_id;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const body: Record<string, unknown> = { vacancy_id: vacancyId, resume_id: ctx.resumeId };
      if (ctx.message?.trim()) body.message = ctx.message.trim().slice(0, 500);
      const res = await fetch("https://api.hh.ru/negotiations", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "EZOffer/1.0",
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return { ok: false, error: `HTTP ${res.status} ${detail.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "network error" };
    } finally {
      clearTimeout(timer);
    }
  },
  async fetchVacancies(query: VacancyQuery): Promise<VacancyFetchResult> {
    const token = getToken();
    if (!token) {
      return { vacancies: [], provider: "hh", ok: false, error: "HH_ACCESS_TOKEN не настроен" };
    }
    const params = new URLSearchParams();
    if (query.text) params.set("text", query.text);
    params.set("per_page", String(Math.min(Math.max(1, query.limit ?? 50), 100)));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(`${BASE}?${params.toString()}`, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "EZOffer/1.0 (demo)",
          Accept: "application/json",
        },
        cache: "no-store",
      });
      if (!res.ok) {
        return { vacancies: [], provider: "hh", ok: false, error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as HhRaw;
      const vacancies = (data.items ?? [])
        .map(mapHhVacancy)
        .filter((v): v is Vacancy => Boolean(v));
      return { vacancies, provider: "hh", ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "network error";
      return { vacancies: [], provider: "hh", ok: false, error: msg };
    } finally {
      clearTimeout(timer);
    }
  },
};