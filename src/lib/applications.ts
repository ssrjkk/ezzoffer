import { db } from "./db";
import { getVacancyBySlug, getVacancyIndex } from "./vacancies";

export type ApplicationRow = {
  id: number;
  user_id: number;
  job_slug: string;
  search_id: number | null;
  resume_id: number | null;
  letter_id: number | null;
  status: string;
  response: string;
  response_note: string;
  message: string;
  sent_at: number;
  viewed_at: number | null;
  responded_at: number | null;
  withdrawn: number;
};

export const STATUS_RU: Record<string, string> = {
  sent: "Отправлен",
  viewed: "Просмотрен",
  responded: "Ответ HR",
};

export function serializeApplication(row: ApplicationRow) {
  const vacancy = getVacancyBySlug(row.job_slug);
  return serializeApplicationWith(row, vacancy);
}

function serializeApplicationWith(row: ApplicationRow, vacancy: ReturnType<typeof getVacancyBySlug>) {
  return {
    id: row.id,
    job_slug: row.job_slug,
    search_id: row.search_id,
    resume_id: row.resume_id,
    letter_id: row.letter_id,
    status: row.status,
    status_label: STATUS_RU[row.status] ?? row.status,
    response: row.response,
    response_note: row.response_note,
    message: row.message,
    sent_at: row.sent_at,
    viewed_at: row.viewed_at,
    responded_at: row.responded_at,
    withdrawn: Boolean(row.withdrawn),
    job: vacancy
      ? {
          title: vacancy.title,
          company: vacancy.company,
          salary: vacancy.salary,
          level: vacancy.level,
          format: vacancy.format,
          city: vacancy.city,
          source: vacancy.source,
          source_url: vacancy.source_url,
        }
      : null,
  };
}

export function listApplications(userId: number, limit = 200) {
  const rows = db
    .prepare(
      "SELECT * FROM applications WHERE user_id = ? ORDER BY sent_at DESC LIMIT ?",
    )
    .all(userId, limit) as ApplicationRow[];
  const index = getVacancyIndex();
  return rows.map((row) => serializeApplicationWith(row, index.get(row.job_slug) ?? null));
}