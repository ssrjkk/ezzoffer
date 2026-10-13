import type Database from "better-sqlite3";

/**
 * Пересборка applications со сменой типа resume_id: INTEGER → TEXT.
 *
 * В колонке лежит идентификатор резюме на hh, то есть строка, — именно она
 * уходит в POST /negotiations. Но колонка была объявлена INTEGER, и SQLite
 * приводил числовой hh-id к числу: «7» превращалась в 7. Дальше сравнение
 * `resumes.hh_id = 7` не находило строку «7» — типы не расходятся, а просто не
 * равны, и поиск резюме к отклику молча возвращал пусто. Подготовка к
 * собеседованию собиралась по случайному резюме, и никто об этом не узнавал.
 *
 * Смена типа требует пересборки таблицы — ALTER COLUMN в SQLite нет. Данные
 * переносятся с CAST, чтобы уже испорченные значения стали текстом и снова
 * находились. Проверка идёт по объявленному типу, поэтому миграция
 * одноразовая, а не на каждом запуске.
 *
 * Отдельный модуль, а не функция в db.ts, по двум причинам. Первая: db.ts при
 * импорте открывает файл базы, и тест, который хочет прогнать миграцию на
 * своей базе, вынужден был бы импортировать побочный эффект — ровно та ошибка,
 * из-за которой один из тестов писал в рабочую базу. Вторая: пересоздание
 * таблицы с копированием всех откликов пользователей должно проверяться
 * отдельно от всего остального.
 */
export function migrateApplicationsResumeId(
  instance: Pick<Database.Database, "exec" | "prepare">,
): void {
  const row = instance.prepare("PRAGMA table_info(applications)").all() as {
    name: string;
    type: string;
  }[];
  const resumeCol = row.find((c) => c.name === "resume_id");
  // Уже TEXT — миграция уже проходила (или база создана с нуля).
  if (!resumeCol || resumeCol.type.toUpperCase() !== "INTEGER") return;

  instance.exec("PRAGMA foreign_keys = OFF");
  instance.exec("BEGIN");
  try {
    instance.exec(`
      CREATE TABLE applications_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        job_slug TEXT NOT NULL,
        search_id INTEGER,
        resume_id TEXT,
        letter_id INTEGER,
        status TEXT NOT NULL DEFAULT 'sent',
        response TEXT NOT NULL DEFAULT '',
        response_note TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL DEFAULT '',
        external_url TEXT,
        sent_at INTEGER NOT NULL,
        viewed_at INTEGER,
        responded_at INTEGER,
        withdrawn INTEGER NOT NULL DEFAULT 0
      );
    `);
    /*
     * CAST выражен явно, хотя аффинность TEXT дала бы тот же результат.
     * Смысл в читаемости: видно, что тип меняется намеренно, а не «случайно».
     *
     * Чего CAST не делает — не восстанавливает потерянное. Если hh-id выглядел
     * как «007», INTEGER-аффинность превратила его в 7, и информация о нулях
     * исчезла безвозвратно. Такие значения придётся привязать заново
     * импортом из hh; автоматически их не восстановить.
     */
    instance.exec(`
      INSERT INTO applications_migrated
        (id, user_id, job_slug, search_id, resume_id, letter_id, status, response,
         response_note, message, external_url, sent_at, viewed_at, responded_at, withdrawn)
      SELECT
        id, user_id, job_slug, search_id, CAST(resume_id AS TEXT), letter_id, status, response,
        response_note, message, external_url, sent_at, viewed_at, responded_at, withdrawn
      FROM applications;
    `);
    instance.exec("DROP TABLE applications");
    instance.exec("ALTER TABLE applications_migrated RENAME TO applications");
    /*
     * AUTOINCREMENT и перенос id.
     *
     * `sqlite_sequence` при пересборке сохраняется: SQLite пересчитывает его по
     * максимальному перенесённому id. Новые отклики продолжают нумерацию, а не
     * начинают с единицы и не падают на занятом первичном ключе.
     */
    /*
     * Индексы не переживают пересоздание таблицы. Без них выборка откликов
     * пользователя сканирует таблицу целиком — на реальных объёмах кабинет
     * открывается заметно медленнее, и ни одна ошибка не возникает.
     */
    instance.exec("CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id)");
    instance.exec("CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_slug)");
    instance.exec("CREATE INDEX IF NOT EXISTS idx_applications_user_sent ON applications(user_id, sent_at)");
    instance.exec("CREATE INDEX IF NOT EXISTS idx_applications_user_job ON applications(user_id, job_slug)");
    instance.exec("COMMIT");
  } catch (err) {
    instance.exec("ROLLBACK");
    throw err;
  } finally {
    instance.exec("PRAGMA foreign_keys = ON");
  }
}