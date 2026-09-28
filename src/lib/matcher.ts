import { getCatalog } from "./vacancies";
import type { Vacancy } from "./vacancies";

export type SearchRow = {
  id: number;
  user_id: number;
  title: string;
  keywords: string;
  salary_min: number | null;
  salary_max: number | null;
  format: string;
  city: string;
  level: string;
  company_blacklist: string;
  active: number;
  started_at: number | null;
  created_at: number;
};

function splitTerms(value: string): string[] {
  return value
    .split(/[,\s;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function matchesSearch(vacancy: Vacancy, s: SearchRow): boolean {
  const haystack = `${vacancy.title} ${vacancy.company} ${vacancy.category}`.toLowerCase();
  const keywords = splitTerms(s.keywords);
  if (keywords.length && !keywords.some((k) => haystack.includes(k))) return false;

  if (s.level && s.level !== vacancy.level) return false;
  if (s.format && s.format !== vacancy.format) return false;
  if (s.city && !vacancy.city.toLowerCase().includes(s.city.toLowerCase())) return false;

  const salary = vacancy.salary_min ?? 0;
  if (s.salary_min != null && salary > 0 && salary < s.salary_min) return false;
  if (s.salary_max != null && salary > 0 && salary > s.salary_max) return false;

  const blacklist = splitTerms(s.company_blacklist);
  if (blacklist.some((c) => vacancy.company.toLowerCase().includes(c))) return false;

  return true;
}

export function matchCount(s: SearchRow): number {
  return getCatalog().filter((v) => matchesSearch(v, s)).length;
}