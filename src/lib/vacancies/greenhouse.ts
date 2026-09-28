import type { Level, WorkFormat } from "../data";
import type { Vacancy, VacancyFetchResult, VacancyProvider, VacancyQuery } from "./types";
import { cleanHtml, sanitizeExternalUrl } from "./util";

const DEFAULT_BOARDS = ["mozilla", "airbnb", "spotify", "stripe", "gitlab", "netflix"];
const FETCH_TIMEOUT = 25_000;

type GreenhouseJob = {
  id?: number;
  title?: string;
  absolute_url?: string;
  location?: { name?: string };
  first_published?: string;
  updated_at?: string;
  content?: string;
  company_name?: string;
  departments?: { name?: string }[];
  offices?: { name?: string }[];
};



function relativePosted(iso?: string): string {
  if (!iso) return "недавно";
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
  if (/(intern|trainee)/.test(s)) return "Intern";
  if (/(junior|entry)/.test(s)) return "Junior";
  if (/(senior|principal|staff|lead|director|head|manager|distinguished)/.test(s)) return "Senior";
  return "Middle";
}

function inferFormat(loc?: string): WorkFormat {
  const s = (loc ?? "").toLowerCase();
  if (/remote/i.test(s)) return "Удалённо";
  if (/(hybrid)/.test(s)) return "Гибрид";
  return "В офисе";
}

export function mapGreenhouseVacancy(raw: GreenhouseJob, fallbackCompany = "Компания"): Vacancy | null {
  if (!raw.id && !raw.title) return null;
  const title = raw.title ?? "Вакансия";
  const content = cleanHtml(raw.content ?? "");
  const loc = raw.location?.name?.trim() ?? "Удалённо";
  const company = raw.company_name ?? fallbackCompany;
  const departments = raw.departments?.map((d) => d.name).filter(Boolean).join(", ") ?? "";
  const offices = raw.offices?.map((o) => o.name).filter(Boolean).join(", ") ?? "";
  const city = offices || loc || "Remote";

  function extractSection(contentText: string, header: string): string[] {
    const re = new RegExp(`${header}\\s*[:\n]([^\\n]{0,1200})`, "i");
    const m = contentText.match(re);
    if (!m) return [];
    return [m[1].trim()];
  }

  const requirementsSection = extractSection(content, "Requirements");
  const responsibilitiesSection = extractSection(content, "What you'll do");

  return {
    slug: `greenhouse-${raw.id ?? title}`,
    source: "greenhouse",
    source_id: String(raw.id ?? title),
    title,
    company,
    salary: "по договорённости",
    salary_min: null,
    salary_max: null,
    level: inferLevel(title),
    format: inferFormat(loc),
    city,
    posted: relativePosted(raw.first_published),
    category: departments || "Работа",
    about: content.slice(0, 2000) || "Описание доступно на странице вакансии.",
    responsibilities: responsibilitiesSection,
    requirements: requirementsSection,
    bonus: [],
    source_url: sanitizeExternalUrl(raw.absolute_url),
    contact_email: null,
    contact_phone: null,
  };
}

export function parseGreenhouseBoards(): string[] {
  const value = (process.env.GREENHOUSE_BOARDS ?? "").trim();
  if (value) {
    return value
      .split(",")
      .map((s) => s.trim())
      .map((s) => {
        const m = s.match(/(?:boards\/)?([^/]+)$/i);
        return m?.[1] ?? s;
      })
      .filter(Boolean)
      .slice(0, 25);
  }
  return DEFAULT_BOARDS;
}

export const greenhouseProvider: VacancyProvider = {
  source: "greenhouse",
  label: "Сайты компаний (Greenhouse)",
  isAvailable: () => true,
  async fetchVacancies(query: VacancyQuery): Promise<VacancyFetchResult> {
    const boards = parseGreenhouseBoards();
    const jobs = new Map<string, Vacancy>();

    await Promise.all(
      boards.map(async (board) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        try {
          const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`;
          const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
          if (!res.ok) return;
          const data = (await res.json()) as { jobs?: GreenhouseJob[] };
          const company = board.charAt(0).toUpperCase() + board.slice(1);
          for (const job of data.jobs ?? []) {
            if (jobs.size >= (query.limit ?? 50)) break;
            const v = mapGreenhouseVacancy(job, company);
            if (v && !jobs.has(v.slug)) jobs.set(v.slug, v);
          }
        } catch {
          /* доска недоступна — пропускаем */
        } finally {
          clearTimeout(timer);
        }
      }),
    );

    let vacancies = [...jobs.values()];
    if (query.text) {
      const t = query.text.toLowerCase();
      vacancies = vacancies.filter((v) => `${v.title} ${v.company} ${v.category}`.toLowerCase().includes(t));
    }
    const limit = Math.min(Math.max(1, query.limit ?? 50), 100);
    return {
      vacancies: vacancies.slice(0, limit),
      provider: "greenhouse",
      ok: vacancies.length > 0,
      ...(vacancies.length === 0 ? { error: "Вакансии не получены (доски компаний недоступны)" } : {}),
    };
  },
};