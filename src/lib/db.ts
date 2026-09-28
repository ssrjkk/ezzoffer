import Database from "better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { logInfo } from "./logger";

const DB_PATH = process.env.EZOFFER_DB_PATH ?? path.join(process.cwd(), "data", "ezoffer.db");

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
  hh_resume_id TEXT,
  telegram_chat_id TEXT,
  autoapply_paused INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_states (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

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

CREATE TABLE IF NOT EXISTS resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  years_label TEXT NOT NULL DEFAULT '',
  ai_improved INTEGER NOT NULL DEFAULT 0,
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
  resume_id INTEGER,
  letter_id INTEGER,
  status TEXT NOT NULL DEFAULT 'sent',
  response TEXT NOT NULL DEFAULT '',
  response_note TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  sent_at INTEGER NOT NULL,
  viewed_at INTEGER,
  responded_at INTEGER,
  withdrawn INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_slug);
CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id);
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
  fetched_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vacancies_source ON vacancies(source);
`;

export function createDatabase(filePath: string): Database.Database {
  if (filePath !== ":memory:") mkdirSync(path.dirname(filePath), { recursive: true });
  const instance = new Database(filePath, { timeout: 10_000 });
  if (filePath !== ":memory:") {
    try {
      instance.pragma("journal_mode = WAL");
    } catch (err) {
      logInfo("db", "WAL недоступен, используем дефолтный режим журнала", { error: String(err) });
    }
  }
  instance.pragma("foreign_keys = ON");
  instance.exec(SCHEMA_SQL);
  migrate(instance);
  logInfo("db", filePath === ":memory:" ? "открыта in-memory БД" : `открыта БД: ${filePath}`);
  return instance;
}

function columnNames(instance: Database.Database, table: string): Set<string> {
  const rows = instance.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

/** Идемпотентные миграции для существующих БД (CREATE TABLE IF NOT EXISTS не добавляет колонки). */
function migrate(instance: Database.Database): void {
  const userCols = columnNames(instance, "users");
  const additions: [string, string][] = [];
  if (!userCols.has("hh_token")) additions.push(["hh_token", "TEXT"]);
  if (!userCols.has("hh_token_expires_at")) additions.push(["hh_token_expires_at", "INTEGER"]);
  if (!userCols.has("hh_resume_id")) additions.push(["hh_resume_id", "TEXT"]);
  if (!userCols.has("telegram_chat_id")) additions.push(["telegram_chat_id", "TEXT"]);
  if (!userCols.has("autoapply_paused")) additions.push(["autoapply_paused", "INTEGER NOT NULL DEFAULT 0"]);
  for (const [name, type] of additions) {
    instance.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  }
  const appCols = columnNames(instance, "applications");
  if (!appCols.has("message")) {
    instance.exec("ALTER TABLE applications ADD COLUMN message TEXT NOT NULL DEFAULT ''");
  }
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
  hh_resume_id: string | null;
  telegram_chat_id: string | null;
  autoapply_paused: number;
};

export function getUserById(id: number): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function getUserByEmail(email: string): User | undefined {
  return db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase().trim()) as User | undefined;
}