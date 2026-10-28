import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { logInfo } from './logger';
import {
  migrateApplicationsResumeId,
  addNotifiedAtColumn,
  addNotifiedClaimColumn,
  migrateApplicationsOrigin,
  migrateUserMode,
  migrateResumeVariants,
  migratePayments,
  migrateOauthAccounts,
  migrateSecretColumns,
  migrateTelegramInbox,
  migrateSessionsSecurity,
  dedupeApplications,
} from './db-migrations';
import { envStr } from './env';

/**
 * Путь к файлу БД.
 *
 * Компоненты собираются в рантайме намеренно, по частям: Turbopack
 * статически анализирует path.join(cwd, "data", "ezoffer.db") и включал
 * локальную ezoffer.db (хэши паролей, OAuth-токены) в .next/standalone и
 * Docker-образ. Динамическая сборка делает путь непрозрачным для анализатора,
 * поэтому tracing не может вывести статический путь к данным.
 *
 * Пустая строка в env (частая после копирования .env.example, где переменная
 * объявлена пустой) не должна превращаться в путь "" — better-sqlite3 открыл бы
 * временную БД в памяти, и все данные пропали бы при рестарте.
 */
export function resolveDbPath(
  env: Record<string, string | undefined>,
  cwd: string = process.cwd(),
): string {
  const configured = envStr(env, 'EZOFFER_DB_PATH', '');
  if (configured) return configured;
  const parts = ['data', 'ezoffer.db'];
  // turbopackIgnore: путь к БД намеренно непрозрачен для анализатора, и сборке
  // не нужно тащить из-за него весь проект в standalone-образ.
  return path.join(/* turbopackIgnore: true */ cwd, ...parts);
}

const DB_PATH = resolveDbPath(process.env);

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  plan TEXT NOT NULL DEFAULT 'none',
  plan_period INTEGER,
  plan_activated_at INTEGER,
  plan_expires_at INTEGER,
  trial_started_at INTEGER,
  hh_token TEXT,
  hh_token_expires_at INTEGER,
  hh_refresh_token TEXT,
  hh_resume_id TEXT,
  telegram_chat_id TEXT,
  autoapply_paused INTEGER NOT NULL DEFAULT 0,
  autoapply_blocked_until INTEGER NOT NULL DEFAULT 0,
  autoapply_block_reason TEXT NOT NULL DEFAULT '',
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_verification_token TEXT,
  email_verification_expires INTEGER,
  password_reset_token TEXT,
  password_reset_expires INTEGER,
  mode TEXT NOT NULL DEFAULT 'demo' CHECK (mode IN ('demo','live'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  /*
   * Начало жизни сессии для абсолютного потолка (90 дней): ротация продлевает
   * expires_at бесконечно, и без created_at активный пользователь жил бы на
   * одной цепочке сессий вечно. NULL — строка, созданная до миграции или
   * напрямую тестом: к ней применяется только скользящий срок.
   */
  created_at INTEGER
);

-- Уборка просроченных сессий идёт по expires_at, а поиск активной сессии — по
-- token (PK). Без этих индексов purgeExpiredAuthRows сканировал всю таблицу.
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS oauth_states (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

-- Очередь входящих апдейтов Telegram: вебхук только складывает тело,
-- разбор идёт в тике планировщика (processInbox), а не в HTTP-запросе.
-- attempts — защита от вечного круга на битом сообщении.
CREATE TABLE IF NOT EXISTS tg_inbox (
  update_id INTEGER PRIMARY KEY,
  body TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  claimed_at INTEGER,
  done_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tg_inbox_pending ON tg_inbox(done_at, claimed_at);

CREATE INDEX IF NOT EXISTS idx_oauth_states_user ON oauth_states(user_id);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_codes (
  code TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

-- Счётчики неудачных попыток входа/регистрации (персистентные).
CREATE TABLE IF NOT EXISTS auth_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

-- Журнал внешних эффектов автоотклика (только добавление).
CREATE TABLE IF NOT EXISTS apply_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  job_slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apply_events_user ON apply_events(user_id, created_at);

-- Outbox намерений отправить отклик: claim до сети, удаление после записи.
-- Отдельно от applications, чтобы ни один SELECT статистики/квот/дайджестов
-- менять не пришлось. Незавершённые заявки чистит сборщик протухших.
CREATE TABLE IF NOT EXISTS apply_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  job_slug TEXT NOT NULL,
  resume_id TEXT,
  letter_id INTEGER,
  message TEXT NOT NULL DEFAULT '',
  search_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_outbox_once ON apply_outbox(user_id, job_slug);

CREATE TABLE IF NOT EXISTS resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  years_label TEXT NOT NULL DEFAULT '',
  ai_improved INTEGER NOT NULL DEFAULT 0,
  hh_id TEXT,
  -- Группа A/B-вариантов; NULL — обычное резюме (migrateResumeVariants).
  variant_group TEXT,
  variant_label TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '',
  salary_min INTEGER,
  salary_max INTEGER,
  format TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT '',
  company_blacklist TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  job_slug TEXT NOT NULL,
  search_id INTEGER,
  resume_id TEXT,
  letter_id INTEGER,
  status TEXT NOT NULL DEFAULT 'sent',
  origin TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('real','simulated','user','ai')),
  response TEXT NOT NULL DEFAULT '',
  response_note TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  external_url TEXT,
  sent_at INTEGER NOT NULL,
  viewed_at INTEGER,
  responded_at INTEGER,
  withdrawn INTEGER NOT NULL DEFAULT 0,
  notified_at INTEGER,
  -- Заявка на отправку уведомления (claim). Отдельно от notified_at намеренно:
  -- notified_at означает «отправлено», claim — «взято в работу». kill -9 между
  -- ними оставлял бы строку с меткой навсегда; claim со сроком давности
  -- позволяет подобрать зависшее (см. ALERT_CLAIM_TTL_MS), а отправленное —
  -- никогда не трогает.
  notified_claim_at INTEGER
);

-- События воронки (Фаза 3 пользуется этой таблицей как журналом только для
-- добавления; писателей пока нет — таблица создаётся заранее, чтобы не
-- пересобирать её ради колонки origin позже).
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('real','simulated','user')),
  entity_type TEXT,
  entity_id INTEGER,
  payload TEXT NOT NULL,
  dedupe_key TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  job_slug TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_slug);
CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_resumes_variant
  ON resumes(user_id, variant_group, variant_label);
CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id);
CREATE TABLE IF NOT EXISTS consultations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  theme TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  booked_at INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vacancies (
  slug TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  salary TEXT NOT NULL,
  salary_min INTEGER,
  salary_max INTEGER,
  level TEXT NOT NULL,
  format TEXT NOT NULL,
  city TEXT NOT NULL,
  posted TEXT NOT NULL,
  category TEXT NOT NULL,
  about TEXT NOT NULL,
  responsibilities TEXT NOT NULL DEFAULT '[]',
  requirements TEXT NOT NULL DEFAULT '[]',
  bonus TEXT NOT NULL DEFAULT '[]',
  source_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  published_at INTEGER,
  /**
   * Занятость как её отдала площадка.
   *
   * Хранится дословно («Временная работа», «Неполный рабочий день», «part-time»):
   * переводить её в «подработка» при загрузке нельзя — решение принимается при
   * показе, и перевод должен быть виден и проверяем.
   */
  employment TEXT,
  fetched_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vacancies_source ON vacancies(source);
/* Чистка протухших фильтрует по source + fetched_at — без составного индекса каждый проход сканировал весь source. */
CREATE INDEX IF NOT EXISTS idx_vacancies_source_fetched ON vacancies(source, fetched_at);
/* Активные поиски — горячий фильтр каждого тика каталога. */
CREATE INDEX IF NOT EXISTS idx_searches_active ON searches(active);

-- Дополнительные индексы для выборок, которые идут по составному ключу.
-- Без них purgeExpiredAuthRows и todayCount сканировали таблицу целиком.
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_telegram_codes_expires ON telegram_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_telegram_codes_user ON telegram_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_user_sent ON applications(user_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_applications_user_job ON applications(user_id, job_slug);
/*
 * Один отклик на вакансию (I4).
 *
 * Частичный уникальный индекс: withdrawn = 1 (отозванные) из-под него
 * выведены, поэтому «отозвать и откликнуться заново» работает, а два живых
 * отклика на одну вакансию база не примет ни при какой гонке. Проверка
 * «SELECT → сеть → INSERT» в коде остаётся для дружелюбного 409, но решать
 * теперь должна база, а не порядок строк кода.
 */
CREATE UNIQUE INDEX IF NOT EXISTS ux_applications_once
  ON applications(user_id, job_slug) WHERE withdrawn = 0;
CREATE INDEX IF NOT EXISTS idx_letters_user ON letters(user_id);
`;

export function createDatabase(filePath: string): Database.Database {
  if (filePath !== ':memory:') mkdirSync(path.dirname(filePath), { recursive: true });
  const instance = new Database(filePath, { timeout: 10_000 });
  if (filePath !== ':memory:') {
    try {
      instance.pragma('journal_mode = WAL');
    } catch (err) {
      logInfo(
        'db',
        'WAL недоступен, используем дефолтный режим журнала',
        { error: String(err) },
      );
    }
  }
  instance.pragma('foreign_keys = ON');
  instance.exec(SCHEMA_SQL);
  migrate(instance);
  logInfo(
    'db',
    filePath === ':memory:' ? 'открыта in-memory БД' : `открыта БД: ${filePath}`,
  );
  return instance;
}

function columnNames(instance: Database.Database, table: string): Set<string> {
  const rows = instance.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

/** Идемпотентные миграции для существующих БД (CREATE TABLE IF NOT EXISTS не добавляет колонки). */
function migrate(instance: Database.Database): void {
  const userCols = columnNames(instance, 'users');
  const additions: [string, string][] = [];
  if (!userCols.has('hh_token')) additions.push(['hh_token', 'TEXT']);
  if (!userCols.has('hh_token_expires_at')) additions.push(['hh_token_expires_at', 'INTEGER']);
  if (!userCols.has('hh_refresh_token')) additions.push(['hh_refresh_token', 'TEXT']);
  if (!userCols.has('hh_resume_id')) additions.push(['hh_resume_id', 'TEXT']);
  if (!userCols.has('telegram_chat_id')) additions.push(['telegram_chat_id', 'TEXT']);
  if (!userCols.has('autoapply_paused'))
    additions.push(['autoapply_paused', 'INTEGER NOT NULL DEFAULT 0']);
  // Блокировка аккаунта площадкой: переживает перезапуск, иначе сервис
  // снова пошёл бы откликаться в аккаунт, который hh только что отклонил.
  if (!userCols.has('autoapply_blocked_until'))
    additions.push(['autoapply_blocked_until', 'INTEGER NOT NULL DEFAULT 0']);
  if (!userCols.has('autoapply_block_reason'))
    additions.push(['autoapply_block_reason', "TEXT NOT NULL DEFAULT ''"]);
  if (!userCols.has('email_verified'))
    additions.push(['email_verified', 'INTEGER NOT NULL DEFAULT 0']);
  if (!userCols.has('email_verification_token'))
    additions.push(['email_verification_token', 'TEXT']);
  // Срок жизни ссылки подтверждения: без него токен вечен, и письмо годичной
  // давности подтверждает ящик, который за это время мог сменить владельца.
  if (!userCols.has('email_verification_expires'))
    additions.push(['email_verification_expires', 'INTEGER']);
  if (!userCols.has('password_reset_token')) additions.push(['password_reset_token', 'TEXT']);
  if (!userCols.has('password_reset_expires'))
    additions.push(['password_reset_expires', 'INTEGER']);
  /*
   * Ожидания по зарплате и городу.
   *
   * NULL и 0 — разные вещи, и различие здесь существенное: «хочу от 0» не
   * значит ничего, а «хочу от 150000» отсекает вакансии дешевле. Поэтому
   * пустое значение хранится как NULL, и подбор не применяет фильтр.
   */
  if (!userCols.has('salary_expectation')) additions.push(['salary_expectation', 'INTEGER']);
  if (!userCols.has('city_preference'))
    additions.push(['city_preference', "TEXT NOT NULL DEFAULT ''"]);
  for (const [name, type] of additions) {
    instance.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  }
  migrateUserMode(instance);
  migrateResumeVariants(instance);
  migratePayments(instance);
  migrateOauthAccounts(instance);
  migrateSecretColumns(instance);
  migrateTelegramInbox(instance);
  migrateSessionsSecurity(instance);
  dedupeApplications(instance);
  instance.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS ux_applications_once ' +
      'ON applications(user_id, job_slug) WHERE withdrawn = 0',
  );
  const appCols = columnNames(instance, 'applications');
  const vacancyCols = columnNames(instance, 'vacancies');
  const resumeCols = columnNames(instance, 'resumes');
  if (!appCols.has('message')) {
    instance.exec("ALTER TABLE applications ADD COLUMN message TEXT NOT NULL DEFAULT ''");
  }
  /*
   * Дата публикации: без неё невозможно отличить свежую вакансию от недельной
   * давности, а отклик на закрытую тратит слот дневного лимита.
   */
  /*
   * Занятость от площадки.
   *
   * Без неё режим работы пришлось бы выводить из текста вакансии, хотя у
   * GeekJob поле `jobFormat.parttime`, а у Работы России — `employment` и
   * `schedule` уже отдаются готовыми значениями.
   *
   * Проверка обязательна: колонка уже есть в CREATE TABLE, и ALTER без неё
   * падает на «duplicate column name» — то есть на любой свежей базе, а не
   * только на старой.
   */
  if (!vacancyCols.has('employment')) {
    instance.exec('ALTER TABLE vacancies ADD COLUMN employment TEXT');
  }
  if (!vacancyCols.has('published_at')) {
    instance.exec('ALTER TABLE vacancies ADD COLUMN published_at INTEGER');
  }
  /*
   * Привязка резюме к резюме на hh.
   *
   * Без неё резюме в нашей базе и резюме, которое уходит в отклике, — разные
   * вещи: подбор шёл по локальному резюме, а отправлялось users.hh_resume_id.
   * С несколькими резюме это означало, что система оценивает вакансию по одному
   * резюме, а отправляет другое, и человек об этом не знает.
   *
   * NULL — не ошибка, а обычное состояние резюме, созданного вручную: его
   * можно оценивать и использовать в письме, но отправить на hh нельзя.
   */
  if (!resumeCols.has('hh_id')) {
    instance.exec('ALTER TABLE resumes ADD COLUMN hh_id TEXT');
  }
  // Одно и то же резюме с hh не должно импортироваться дважды: иначе в
  // подборе появятся два одинаковых кандидата, а в интерфейсе — путаница.
  instance.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_resumes_hh ON resumes(user_id, hh_id) WHERE hh_id IS NOT NULL',
  );
  if (!appCols.has('external_url')) {
    instance.exec('ALTER TABLE applications ADD COLUMN external_url TEXT');
  }
  /*
   * Порядок обязателен.
   *
   * Миграция resume_id пересобирает таблицу и переносит notified_at, поэтому
   * колонка должна существовать ДО неё. Наоборот получается ошибка
   * «no such column: notified_at» на любой свежей базе: в CREATE TABLE её ещё
   * нет, а перенос уже читает.
   */
  addNotifiedAtColumn(instance);
  addNotifiedClaimColumn(instance);
  migrateApplicationsOrigin(instance);
  migrateApplicationsResumeId(instance);
  // Избранное: уникальность по (пользователь, вакансия) выражена в самой
  // таблице — иначе повторное нажатие «в избранное» плодило бы дубли, и в
  // списке одна вакансия появлялась бы дважды.
  instance.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_user_job ON bookmarks(user_id, job_slug)',
  );
  /*
   * Метки A/B-вариантов уникальны в группе: два параллельных создания иначе
   * выдавали бы две метки «B». NULL в UNIQUE считается различным значением,
   * поэтому обычные резюме без группы индекс не задевает.
   */
  instance.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS ux_resumes_variant ON resumes(user_id, variant_group, variant_label)',
  );
}

export const db = createDatabase(DB_PATH);

export type User = {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  created_at: number;
  plan: string;
  plan_period: number | null;
  plan_activated_at: number | null;
  plan_expires_at: number | null;
  trial_started_at: number | null;
  hh_token: string | null;
  hh_token_expires_at: number | null;
  hh_refresh_token: string | null;
  hh_resume_id: string | null;
  telegram_chat_id: string | null;
  autoapply_paused: number;
  /** До какого момента hh ограничил аккаунт (0 — ограничения нет). */
  autoapply_blocked_until: number;
  autoapply_block_reason: string;
  email_verified: number;
  email_verification_token: string | null;
  email_verification_expires: number | null;
  password_reset_token: string | null;
  password_reset_expires: number | null;
  /** Ожидание по зарплате; null — не задано, фильтр по зарплате не применяется. */
  salary_expectation: number | null;
  /** Предпочтительный город; пустая строка — не задан. */
  city_preference: string;
  /** demo — обычный режим, live — hh подключён и человек явно согласился. */
  mode: 'demo' | 'live';
};

export function getUserById(id: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function getUserByEmail(email: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) as
    User | undefined;
}
