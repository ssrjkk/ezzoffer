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
  /** Можно ли обновить каталог этого источника. Для hh нужен токен приложения. */
  isAvailable(): boolean;
  /**
   * Можно ли отправить отклик от имени пользователя.
   *
   * Отдельный метод не избыточен: у hh поиск требует токена приложения, а
   * отправка — только пользовательского. Проверка одним `isAvailable()`
   * выключала автоотклик у всех, у кого сервис не настроен на поиск, хотя их
   * собственный токен hh работал.
   */
  canApply?(userToken: string | null, resumeId: string | null): boolean;
  fetchVacancies(query: VacancyQuery): Promise<VacancyFetchResult>;
  apply?(
    vacancy: Vacancy,
    ctx: { resumeId: string; message?: string; accessToken?: string },
  ): Promise<VacancyApplyResult>;
}