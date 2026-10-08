import type { Level, WorkFormat } from "../data";

export type VacancySource =
  | "local"
  | "trudvsem"
  | "hh"
  | "remoteok"
  | "greenhouse"
  | "company" // RSS-фиды компаний
  | "x" // X / Twitter
  | "tg" // Telegram-каналы компаний
  | "geekjob"
  | "jobicy"
  | "weworkremotely"
  | "rabota";

export type Vacancy = {
  slug: string;
  source: VacancySource;
  source_id: string;
  title: string;
  company: string;
  salary: string;
  salary_min: number | null;
  salary_max: number | null;
  level: Level;
  format: WorkFormat;
  city: string;
  posted: string;
  category: string;
  about: string;
  responsibilities: string[];
  requirements: string[];
  bonus: string[];
  source_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

export type VacancyQuery = {
  text?: string;
  city?: string;
  limit?: number;
};

export type VacancyFetchResult = {
  vacancies: Vacancy[];
  provider: VacancySource;
  ok: boolean;
  error?: string;
};

export type VacancyApplyResult = {
  ok: boolean;
  error?: string;
};

export interface VacancyProvider {
  source: VacancySource;
  label: string;
  isAvailable(): boolean;
  fetchVacancies(query: VacancyQuery): Promise<VacancyFetchResult>;
  apply?(
    vacancy: Vacancy,
    ctx: { resumeId: string; message?: string; accessToken?: string },
  ): Promise<VacancyApplyResult>;
}