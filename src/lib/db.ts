import Database from "better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { logInfo } from "./logger";
import { migrateApplicationsResumeId, addNotifiedAtColumn, migrateApplicationsOrigin, migrateUserMode, migrateResumeVariants, migratePayments } from "./db-migrations";
import { envStr } from "./env";

/**
 * в•ЁРЇв•¤Р“в•¤Р’в•¤Рњ в•Ёв•‘ в•¤Р”в•Ёв–‘в•Ёв•Јв•Ёв•—в•¤Р“ в•ЁРЎв•ЁР¤.
 *
 * в•ЁРЄв•Ёв•›в•Ёв•ќв•Ёв”ђв•Ёв•›в•Ёв•њв•Ёв•Ўв•Ёв•њв•¤Р’в•¤Р› в•¤Р‘в•Ёв•›в•Ёв–’в•Ёв••в•¤Рђв•Ёв–‘в•¤Рћв•¤Р’в•¤Р‘в•¤Рџ в•Ёв–“ в•¤Рђв•Ёв–‘в•Ёв•њв•¤Р’в•Ёв–‘в•Ёв•Јв•Ёв•ќв•Ёв•Ў в•Ёв•њв•Ёв–‘в•Ёв•ќв•Ёв•Ўв•¤Рђв•Ёв•Ўв•Ёв•њв•Ёв•њв•Ёв•›, в•Ёв”ђв•Ёв•› в•¤Р—в•Ёв–‘в•¤Р‘в•¤Р’в•¤Рџв•Ёв•ќ: Turbopack
 * в•¤Р‘в•¤Р’в•Ёв–‘в•¤Р’в•Ёв••в•¤Р—в•Ёв•Ўв•¤Р‘в•Ёв•‘в•Ёв•• в•Ёв–‘в•Ёв•њв•Ёв–‘в•Ёв•—в•Ёв••в•Ёв•–в•Ёв••в•¤Рђв•¤Р“в•Ёв•Ўв•¤Р’ path.join(cwd, "data", "ezoffer.db") в•Ёв•• в•Ёв–“в•Ёв•‘в•Ёв•—в•¤Рћв•¤Р—в•Ёв–‘в•Ёв•—
 * в•Ёв•—в•Ёв•›в•Ёв•‘в•Ёв–‘в•Ёв•—в•¤Рњв•Ёв•њв•¤Р“в•¤Рћ ezoffer.db (в•¤Р•в•¤Рќв•¤Рв•Ёв•• в•Ёв”ђв•Ёв–‘в•¤Рђв•Ёв•›в•Ёв•—в•Ёв•Ўв•Ёв•Ј, OAuth-в•¤Р’в•Ёв•›в•Ёв•‘в•Ёв•Ўв•Ёв•њв•¤Р›) в•Ёв–“ .next/standalone в•Ёв••
 * Docker-в•Ёв•›в•Ёв–’в•¤Рђв•Ёв–‘в•Ёв•–. в•ЁР¤в•Ёв••в•Ёв•њв•Ёв–‘в•Ёв•ќв•Ёв••в•¤Р—в•Ёв•Ўв•¤Р‘в•Ёв•‘в•Ёв–‘в•¤Рџ в•¤Р‘в•Ёв–’в•Ёв•›в•¤Рђв•Ёв•‘в•Ёв–‘ в•Ёв”¤в•Ёв•Ўв•Ёв•—в•Ёв–‘в•Ёв•Ўв•¤Р’ в•Ёв”ђв•¤Р“в•¤Р’в•¤Рњ в•Ёв•њв•Ёв•Ўв•Ёв”ђв•¤Рђв•Ёв•›в•Ёв•–в•¤Рђв•Ёв–‘в•¤Р—в•Ёв•њв•¤Р›в•Ёв•ќ в•Ёв”¤в•Ёв•—в•¤Рџ в•Ёв–‘в•Ёв•њв•Ёв–‘в•Ёв•—в•Ёв••в•Ёв•–в•Ёв–‘в•¤Р’в•Ёв•›в•¤Рђв•Ёв–‘,
 * в•Ёв”ђв•Ёв•›в•¤Рќв•¤Р’в•Ёв•›в•Ёв•ќв•¤Р“ tracing в•Ёв•њв•Ёв•Ў в•Ёв•ќв•Ёв•›в•Ёв•ўв•Ёв•Ўв•¤Р’ в•Ёв–“в•¤Р›в•Ёв–“в•Ёв•Ўв•¤Р‘в•¤Р’в•Ёв•• в•¤Р‘в•¤Р’в•Ёв–‘в•¤Р’в•Ёв••в•¤Р—в•Ёв•Ўв•¤Р‘в•Ёв•‘в•Ёв••в•Ёв•Ј в•Ёв”ђв•¤Р“в•¤Р’в•¤Рњ в•Ёв•‘ в•Ёв”¤в•Ёв–‘в•Ёв•њв•Ёв•њв•¤Р›в•Ёв•ќ.
 *
 * в•ЁРЇв•¤Р“в•¤Р‘в•¤Р’в•Ёв–‘в•¤Рџ в•¤Р‘в•¤Р’в•¤Рђв•Ёв•›в•Ёв•‘в•Ёв–‘ в•Ёв–“ env (в•¤Р—в•Ёв–‘в•¤Р‘в•¤Р’в•Ёв–‘в•¤Рџ в•Ёв”ђв•Ёв•›в•¤Р‘в•Ёв•—в•Ёв•Ў в•Ёв•‘в•Ёв•›в•Ёв”ђв•Ёв••в•¤Рђв•Ёв•›в•Ёв–“в•Ёв–‘в•Ёв•њв•Ёв••в•¤Рџ .env.example, в•Ёв”‚в•Ёв”¤в•Ёв•Ў в•Ёв”ђв•Ёв•Ўв•¤Рђв•Ёв•Ўв•Ёв•ќв•Ёв•Ўв•Ёв•њв•Ёв•њв•Ёв–‘в•¤Рџ
 * в•Ёв•›в•Ёв–’в•¤Рљв•¤Рџв•Ёв–“в•Ёв•—в•Ёв•Ўв•Ёв•њв•Ёв–‘ в•Ёв”ђв•¤Р“в•¤Р‘в•¤Р’в•Ёв•›в•Ёв•Ј) в•Ёв•њв•Ёв•Ў в•Ёв”¤в•Ёв•›в•Ёв•—в•Ёв•ўв•Ёв•њв•Ёв–‘ в•Ёв”ђв•¤Рђв•Ёв•Ўв•Ёв–“в•¤Рђв•Ёв–‘в•¤Р™в•Ёв–‘в•¤Р’в•¤Рњв•¤Р‘в•¤Рџ в•Ёв–“ в•Ёв”ђв•¤Р“в•¤Р’в•¤Рњ "" С‚РђР¤ better-sqlite3 в•Ёв•›в•¤Р’в•Ёв•‘в•¤Рђв•¤Р›в•Ёв•— в•Ёв–’в•¤Р›
 * в•Ёв–“в•¤Рђв•Ёв•Ўв•Ёв•ќв•Ёв•Ўв•Ёв•њв•Ёв•њв•¤Р“в•¤Рћ в•ЁРЎв•ЁР¤ в•Ёв–“ в•Ёв”ђв•Ёв–‘в•Ёв•ќв•¤Рџв•¤Р’в•Ёв••, в•Ёв•• в•Ёв–“в•¤Р‘в•Ёв•Ў в•Ёв”¤в•Ёв–‘в•Ёв•њв•Ёв•њв•¤Р›в•Ёв•Ў в•Ёв”ђв•¤Рђв•Ёв•›в•Ёв”ђв•Ёв–‘в•Ёв•—в•Ёв•• в•Ёв–’в•¤Р› в•Ёв”ђв•¤Рђв•Ёв•• в•¤Рђв•Ёв•Ўв•¤Р‘в•¤Р’в•Ёв–‘в•¤Рђв•¤Р’в•Ёв•Ў.
 */
export function resolveDbPath(
  env: Record<string, string | undefined>,
  cwd: string = process.cwd(),
): string {
  const configured = envStr(env, "EZOFFER_DB_PATH", "");
  if (configured) return configured;
  const parts = ["data", "ezoffer.db"];
  return path.join(cwd, ...parts);
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
  password_reset_token TEXT,
  password_reset_expires INTEGER,
  mode TEXT NOT NULL DEFAULT 'demo' CHECK (mode IN ('demo','live'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

-- в•ЁРів•Ёв–’в•Ёв•›в•¤Рђв•Ёв•‘в•Ёв–‘ в•Ёв”ђв•¤Рђв•Ёв•›в•¤Р‘в•¤Рђв•Ёв•›в•¤Р—в•Ёв•Ўв•Ёв•њв•Ёв•њв•¤Р›в•¤Р• в•¤Р‘в•Ёв•Ўв•¤Р‘в•¤Р‘в•Ёв••в•Ёв•Ј в•Ёв••в•Ёв”¤в•¤РЎв•¤Р’ в•Ёв”ђв•Ёв•› expires_at, в•Ёв–‘ в•Ёв”ђв•Ёв•›в•Ёв••в•¤Р‘в•Ёв•‘ в•Ёв–‘в•Ёв•‘в•¤Р’в•Ёв••в•Ёв–“в•Ёв•њв•Ёв•›в•Ёв•Ј в•¤Р‘в•Ёв•Ўв•¤Р‘в•¤Р‘в•Ёв••в•Ёв•• С‚РђР¤ в•Ёв”ђв•Ёв•›
-- token (PK). в•ЁРЎв•Ёв•Ўв•Ёв•– в•¤Рќв•¤Р’в•Ёв••в•¤Р• в•Ёв••в•Ёв•њв•Ёв”¤в•Ёв•Ўв•Ёв•‘в•¤Р‘в•Ёв•›в•Ёв–“ purgeExpiredAuthRows в•¤Р‘в•Ёв•‘в•Ёв–‘в•Ёв•њв•Ёв••в•¤Рђв•Ёв•›в•Ёв–“в•Ёв–‘в•Ёв•— в•Ёв–“в•¤Р‘в•¤Рћ в•¤Р’в•Ёв–‘в•Ёв–’в•Ёв•—в•Ёв••в•¤Р–в•¤Р“.
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

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
  hh_id TEXT,
  -- Р“СЂСѓРїРїР° A/B-РІР°СЂРёР°РЅС‚РѕРІ; NULL вЂ” РѕР±С‹С‡РЅРѕРµ СЂРµР·СЋРјРµ (migrateResumeVariants).
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
  resume_id INTEGER,
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
  notified_at INTEGER
);

-- РЎРѕР±С‹С‚РёСЏ РІРѕСЂРѕРЅРєРё (Р¤Р°Р·Р° 3 РїРѕР»СЊР·СѓРµС‚СЃСЏ СЌС‚РѕР№ С‚Р°Р±Р»РёС†РµР№ РєР°Рє Р¶СѓСЂРЅР°Р»РѕРј С‚РѕР»СЊРєРѕ РґР»СЏ
-- РґРѕР±Р°РІР»РµРЅРёСЏ; РїРёСЃР°С‚РµР»РµР№ РїРѕРєР° РЅРµС‚ вЂ” С‚Р°Р±Р»РёС†Р° СЃРѕР·РґР°С‘С‚СЃСЏ Р·Р°СЂР°РЅРµРµ, С‡С‚РѕР±С‹ РЅРµ
-- РїРµСЂРµСЃРѕР±РёСЂР°С‚СЊ РµС‘ СЂР°РґРё РєРѕР»РѕРЅРєРё origin РїРѕР·Р¶Рµ).
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
   * Р—Р°РЅСЏС‚РѕСЃС‚СЊ РєР°Рє РµС‘ РѕС‚РґР°Р»Р° РїР»РѕС‰Р°РґРєР°.
   *
   * РҐСЂР°РЅРёС‚СЃСЏ РґРѕСЃР»РѕРІРЅРѕ (В«Р’СЂРµРјРµРЅРЅР°СЏ СЂР°Р±РѕС‚Р°В», В«РќРµРїРѕР»РЅС‹Р№ СЂР°Р±РѕС‡РёР№ РґРµРЅСЊВ», В«part-timeВ»):
   * РїРµСЂРµРІРѕРґРёС‚СЊ РµС‘ РІ В«РїРѕРґСЂР°Р±РѕС‚РєР°В» РїСЂРё Р·Р°РіСЂСѓР·РєРµ РЅРµР»СЊР·СЏ вЂ” СЂРµС€РµРЅРёРµ РїСЂРёРЅРёРјР°РµС‚СЃСЏ РїСЂРё
   * РїРѕРєР°Р·Рµ, Рё РїРµСЂРµРІРѕРґ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РІРёРґРµРЅ Рё РїСЂРѕРІРµСЂСЏРµРј.
   */
  employment TEXT,
  fetched_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vacancies_source ON vacancies(source);

-- в•ЁР¤в•Ёв•›в•Ёв”ђв•Ёв•›в•Ёв•—в•Ёв•њв•Ёв••в•¤Р’в•Ёв•Ўв•Ёв•—в•¤Рњв•Ёв•њв•¤Р›в•Ёв•Ў в•Ёв••в•Ёв•њв•Ёв”¤в•Ёв•Ўв•Ёв•‘в•¤Р‘в•¤Р› в•Ёв”¤в•Ёв•—в•¤Рџ в•Ёв–“в•¤Р›в•Ёв–’в•Ёв•›в•¤Рђв•Ёв•›в•Ёв•‘, в•Ёв•‘в•Ёв•›в•¤Р’в•Ёв•›в•¤Рђв•¤Р›в•Ёв•Ў в•Ёв••в•Ёв”¤в•¤Р“в•¤Р’ в•Ёв”ђв•Ёв•› в•¤Р‘в•Ёв•›в•¤Р‘в•¤Р’в•Ёв–‘в•Ёв–“в•Ёв•њв•Ёв•›в•Ёв•ќв•¤Р“ в•Ёв•‘в•Ёв•—в•¤Рћв•¤Р—в•¤Р“.
-- в•ЁРЎв•Ёв•Ўв•Ёв•– в•Ёв•њв•Ёв••в•¤Р• purgeExpiredAuthRows в•Ёв•• todayCount в•¤Р‘в•Ёв•‘в•Ёв–‘в•Ёв•њв•Ёв••в•¤Рђв•Ёв•›в•Ёв–“в•Ёв–‘в•Ёв•—в•Ёв•• в•¤Р’в•Ёв–‘в•Ёв–’в•Ёв•—в•Ёв••в•¤Р–в•¤Р“ в•¤Р–в•Ёв•Ўв•Ёв•—в•Ёв••в•Ёв•‘в•Ёв•›в•Ёв•ќ.
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_telegram_codes_expires ON telegram_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_telegram_codes_user ON telegram_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_user_sent ON applications(user_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_applications_user_job ON applications(user_id, job_slug);
CREATE INDEX IF NOT EXISTS idx_letters_user ON letters(user_id);
`;

export function createDatabase(filePath: string): Database.Database {
  if (filePath !== ":memory:") mkdirSync(path.dirname(filePath), { recursive: true });
  const instance = new Database(filePath, { timeout: 10_000 });
  if (filePath !== ":memory:") {
    try {
      instance.pragma("journal_mode = WAL");
    } catch (err) {
      logInfo("db", "WAL в•Ёв•њв•Ёв•Ўв•Ёв”¤в•Ёв•›в•¤Р‘в•¤Р’в•¤Р“в•Ёв”ђв•Ёв•Ўв•Ёв•њ, в•Ёв••в•¤Р‘в•Ёв”ђв•Ёв•›в•Ёв•—в•¤Рњв•Ёв•–в•¤Р“в•Ёв•Ўв•Ёв•ќ в•Ёв”¤в•Ёв•Ўв•¤Р”в•Ёв•›в•Ёв•—в•¤Р’в•Ёв•њв•¤Р›в•Ёв•Ј в•¤Рђв•Ёв•Ўв•Ёв•ўв•Ёв••в•Ёв•ќ в•Ёв•ўв•¤Р“в•¤Рђв•Ёв•њв•Ёв–‘в•Ёв•—в•Ёв–‘", { error: String(err) });
    }
  }
  instance.pragma("foreign_keys = ON");
  instance.exec(SCHEMA_SQL);
  migrate(instance);
  logInfo("db", filePath === ":memory:" ? "в•Ёв•›в•¤Р’в•Ёв•‘в•¤Рђв•¤Р›в•¤Р’в•Ёв–‘ in-memory в•ЁРЎв•ЁР¤" : `в•Ёв•›в•¤Р’в•Ёв•‘в•¤Рђв•¤Р›в•¤Р’в•Ёв–‘ в•ЁРЎв•ЁР¤: ${filePath}`);
  return instance;
}

function columnNames(instance: Database.Database, table: string): Set<string> {
  const rows = instance.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

/** в•ЁРЁв•Ёв”¤в•Ёв•Ўв•Ёв•ќв•Ёв”ђв•Ёв•›в•¤Р’в•Ёв•Ўв•Ёв•њв•¤Р’в•Ёв•њв•¤Р›в•Ёв•Ў в•Ёв•ќв•Ёв••в•Ёв”‚в•¤Рђв•Ёв–‘в•¤Р–в•Ёв••в•Ёв•• в•Ёв”¤в•Ёв•—в•¤Рџ в•¤Р‘в•¤Р“в•¤Р™в•Ёв•Ўв•¤Р‘в•¤Р’в•Ёв–“в•¤Р“в•¤Рћв•¤Р™в•Ёв••в•¤Р• в•ЁРЎв•ЁР¤ (CREATE TABLE IF NOT EXISTS в•Ёв•њв•Ёв•Ў в•Ёв”¤в•Ёв•›в•Ёв–’в•Ёв–‘в•Ёв–“в•Ёв•—в•¤Рџв•Ёв•Ўв•¤Р’ в•Ёв•‘в•Ёв•›в•Ёв•—в•Ёв•›в•Ёв•њв•Ёв•‘в•Ёв••). */
function migrate(instance: Database.Database): void {
  const userCols = columnNames(instance, "users");
  const additions: [string, string][] = [];
  if (!userCols.has("hh_token")) additions.push(["hh_token", "TEXT"]);
  if (!userCols.has("hh_token_expires_at")) additions.push(["hh_token_expires_at", "INTEGER"]);
  if (!userCols.has("hh_refresh_token")) additions.push(["hh_refresh_token", "TEXT"]);
  if (!userCols.has("hh_resume_id")) additions.push(["hh_resume_id", "TEXT"]);
  if (!userCols.has("telegram_chat_id")) additions.push(["telegram_chat_id", "TEXT"]);
  if (!userCols.has("autoapply_paused")) additions.push(["autoapply_paused", "INTEGER NOT NULL DEFAULT 0"]);
  // Р‘Р»РѕРєРёСЂРѕРІРєР° Р°РєРєР°СѓРЅС‚Р° РїР»РѕС‰Р°РґРєРѕР№: РїРµСЂРµР¶РёРІР°РµС‚ РїРµСЂРµР·Р°РїСѓСЃРє, РёРЅР°С‡Рµ СЃРµСЂРІРёСЃ
  // СЃРЅРѕРІР° РїРѕС€С‘Р» Р±С‹ РѕС‚РєР»РёРєР°С‚СЊСЃСЏ РІ Р°РєРєР°СѓРЅС‚, РєРѕС‚РѕСЂС‹Р№ hh С‚РѕР»СЊРєРѕ С‡С‚Рѕ РѕС‚РєР»РѕРЅРёР».
  if (!userCols.has("autoapply_blocked_until")) additions.push(["autoapply_blocked_until", "INTEGER NOT NULL DEFAULT 0"]);
  if (!userCols.has("autoapply_block_reason")) additions.push(["autoapply_block_reason", "TEXT NOT NULL DEFAULT ''"]);
  if (!userCols.has("email_verified")) additions.push(["email_verified", "INTEGER NOT NULL DEFAULT 0"]);
  if (!userCols.has("email_verification_token")) additions.push(["email_verification_token", "TEXT"]);
  if (!userCols.has("password_reset_token")) additions.push(["password_reset_token", "TEXT"]);
  if (!userCols.has("password_reset_expires")) additions.push(["password_reset_expires", "INTEGER"]);
  /*
   * РћР¶РёРґР°РЅРёСЏ РїРѕ Р·Р°СЂРїР»Р°С‚Рµ Рё РіРѕСЂРѕРґСѓ.
   *
   * NULL Рё 0 вЂ” СЂР°Р·РЅС‹Рµ РІРµС‰Рё, Рё СЂР°Р·Р»РёС‡РёРµ Р·РґРµСЃСЊ СЃСѓС‰РµСЃС‚РІРµРЅРЅРѕРµ: В«С…РѕС‡Сѓ РѕС‚ 0В» РЅРµ
   * Р·РЅР°С‡РёС‚ РЅРёС‡РµРіРѕ, Р° В«С…РѕС‡Сѓ РѕС‚ 150000В» РѕС‚СЃРµРєР°РµС‚ РІР°РєР°РЅСЃРёРё РґРµС€РµРІР»Рµ. РџРѕСЌС‚РѕРјСѓ
   * РїСѓСЃС‚РѕРµ Р·РЅР°С‡РµРЅРёРµ С…СЂР°РЅРёС‚СЃСЏ РєР°Рє NULL, Рё РїРѕРґР±РѕСЂ РЅРµ РїСЂРёРјРµРЅСЏРµС‚ С„РёР»СЊС‚СЂ.
   */
  if (!userCols.has("salary_expectation")) additions.push(["salary_expectation", "INTEGER"]);
  if (!userCols.has("city_preference")) additions.push(["city_preference", "TEXT NOT NULL DEFAULT ''"]);
  for (const [name, type] of additions) {
    instance.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  }
  migrateUserMode(instance);
  migrateResumeVariants(instance);
  migratePayments(instance);
  const appCols = columnNames(instance, "applications");
  const vacancyCols = columnNames(instance, "vacancies");
  const resumeCols = columnNames(instance, "resumes");
  if (!appCols.has("message")) {
    instance.exec("ALTER TABLE applications ADD COLUMN message TEXT NOT NULL DEFAULT ''");
  }
  /*
   * Р”Р°С‚Р° РїСѓР±Р»РёРєР°С†РёРё: Р±РµР· РЅРµС‘ РЅРµРІРѕР·РјРѕР¶РЅРѕ РѕС‚Р»РёС‡РёС‚СЊ СЃРІРµР¶СѓСЋ РІР°РєР°РЅСЃРёСЋ РѕС‚ РЅРµРґРµР»СЊРЅРѕР№
   * РґР°РІРЅРѕСЃС‚Рё, Р° РѕС‚РєР»РёРє РЅР° Р·Р°РєСЂС‹С‚СѓСЋ С‚СЂР°С‚РёС‚ СЃР»РѕС‚ РґРЅРµРІРЅРѕРіРѕ Р»РёРјРёС‚Р°.
   */
  /*
   * Р—Р°РЅСЏС‚РѕСЃС‚СЊ РѕС‚ РїР»РѕС‰Р°РґРєРё.
   *
   * Р‘РµР· РЅРµС‘ СЂРµР¶РёРј СЂР°Р±РѕС‚С‹ РїСЂРёС€Р»РѕСЃСЊ Р±С‹ РІС‹РІРѕРґРёС‚СЊ РёР· С‚РµРєСЃС‚Р° РІР°РєР°РЅСЃРёРё, С…РѕС‚СЏ Сѓ
   * GeekJob РїРѕР»Рµ `jobFormat.parttime`, Р° Сѓ Р Р°Р±РѕС‚С‹ Р РѕСЃСЃРёРё вЂ” `employment` Рё
   * `schedule` СѓР¶Рµ РѕС‚РґР°СЋС‚СЃСЏ РіРѕС‚РѕРІС‹РјРё Р·РЅР°С‡РµРЅРёСЏРјРё.
   *
   * РџСЂРѕРІРµСЂРєР° РѕР±СЏР·Р°С‚РµР»СЊРЅР°: РєРѕР»РѕРЅРєР° СѓР¶Рµ РµСЃС‚СЊ РІ CREATE TABLE, Рё ALTER Р±РµР· РЅРµС‘
   * РїР°РґР°РµС‚ РЅР° В«duplicate column nameВ» вЂ” С‚Рѕ РµСЃС‚СЊ РЅР° Р»СЋР±РѕР№ СЃРІРµР¶РµР№ Р±Р°Р·Рµ, Р° РЅРµ
   * С‚РѕР»СЊРєРѕ РЅР° СЃС‚Р°СЂРѕР№.
   */
  if (!vacancyCols.has("employment")) {
    instance.exec("ALTER TABLE vacancies ADD COLUMN employment TEXT");
  }
  if (!vacancyCols.has("published_at")) {
    instance.exec("ALTER TABLE vacancies ADD COLUMN published_at INTEGER");
    instance.exec("ALTER TABLE vacancies ADD COLUMN employment TEXT");
  }
  /*
   * РџСЂРёРІСЏР·РєР° СЂРµР·СЋРјРµ Рє СЂРµР·СЋРјРµ РЅР° hh.
   *
   * Р‘РµР· РЅРµС‘ СЂРµР·СЋРјРµ РІ РЅР°С€РµР№ Р±Р°Р·Рµ Рё СЂРµР·СЋРјРµ, РєРѕС‚РѕСЂРѕРµ СѓС…РѕРґРёС‚ РІ РѕС‚РєР»РёРєРµ, вЂ” СЂР°Р·РЅС‹Рµ
   * РІРµС‰Рё: РїРѕРґР±РѕСЂ С€С‘Р» РїРѕ Р»РѕРєР°Р»СЊРЅРѕРјСѓ СЂРµР·СЋРјРµ, Р° РѕС‚РїСЂР°РІР»СЏР»РѕСЃСЊ users.hh_resume_id.
   * РЎ РЅРµСЃРєРѕР»СЊРєРёРјРё СЂРµР·СЋРјРµ СЌС‚Рѕ РѕР·РЅР°С‡Р°Р»Рѕ, С‡С‚Рѕ СЃРёСЃС‚РµРјР° РѕС†РµРЅРёРІР°РµС‚ РІР°РєР°РЅСЃРёСЋ РїРѕ РѕРґРЅРѕРјСѓ
   * СЂРµР·СЋРјРµ, Р° РѕС‚РїСЂР°РІР»СЏРµС‚ РґСЂСѓРіРѕРµ, Рё С‡РµР»РѕРІРµРє РѕР± СЌС‚РѕРј РЅРµ Р·РЅР°РµС‚.
   *
   * NULL вЂ” РЅРµ РѕС€РёР±РєР°, Р° РѕР±С‹С‡РЅРѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ СЂРµР·СЋРјРµ, СЃРѕР·РґР°РЅРЅРѕРіРѕ РІСЂСѓС‡РЅСѓСЋ: РµРіРѕ
   * РјРѕР¶РЅРѕ РѕС†РµРЅРёРІР°С‚СЊ Рё РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РІ РїРёСЃСЊРјРµ, РЅРѕ РѕС‚РїСЂР°РІРёС‚СЊ РЅР° hh РЅРµР»СЊР·СЏ.
   */
  if (!resumeCols.has("hh_id")) {
    instance.exec("ALTER TABLE resumes ADD COLUMN hh_id TEXT");
  }
  // РћРґРЅРѕ Рё С‚Рѕ Р¶Рµ СЂРµР·СЋРјРµ СЃ hh РЅРµ РґРѕР»Р¶РЅРѕ РёРјРїРѕСЂС‚РёСЂРѕРІР°С‚СЊСЃСЏ РґРІР°Р¶РґС‹: РёРЅР°С‡Рµ РІ
  // РїРѕРґР±РѕСЂРµ РїРѕСЏРІСЏС‚СЃСЏ РґРІР° РѕРґРёРЅР°РєРѕРІС‹С… РєР°РЅРґРёРґР°С‚Р°, Р° РІ РёРЅС‚РµСЂС„РµР№СЃРµ вЂ” РїСѓС‚Р°РЅРёС†Р°.
  instance.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_resumes_hh ON resumes(user_id, hh_id) WHERE hh_id IS NOT NULL",
  );
  if (!appCols.has("external_url")) {
    instance.exec("ALTER TABLE applications ADD COLUMN external_url TEXT");
  }
  /*
 * РџРѕСЂСЏРґРѕРє РѕР±СЏР·Р°С‚РµР»РµРЅ.
 *
 * РњРёРіСЂР°С†РёСЏ resume_id РїРµСЂРµСЃРѕР±РёСЂР°РµС‚ С‚Р°Р±Р»РёС†Сѓ Рё РїРµСЂРµРЅРѕСЃРёС‚ notified_at, РїРѕСЌС‚РѕРјСѓ
 * РєРѕР»РѕРЅРєР° РґРѕР»Р¶РЅР° СЃСѓС‰РµСЃС‚РІРѕРІР°С‚СЊ Р”Рћ РЅРµС‘. РќР°РѕР±РѕСЂРѕС‚ РїРѕР»СѓС‡Р°РµС‚СЃСЏ РѕС€РёР±РєР°
 * В«no such column: notified_atВ» РЅР° Р»СЋР±РѕР№ СЃРІРµР¶РµР№ Р±Р°Р·Рµ: РІ CREATE TABLE РµС‘ РµС‰С‘
 * РЅРµС‚, Р° РїРµСЂРµРЅРѕСЃ СѓР¶Рµ С‡РёС‚Р°РµС‚.
 */
addNotifiedAtColumn(instance);
migrateApplicationsOrigin(instance);
migrateApplicationsResumeId(instance);
  // РР·Р±СЂР°РЅРЅРѕРµ: СѓРЅРёРєР°Р»СЊРЅРѕСЃС‚СЊ РїРѕ (РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ, РІР°РєР°РЅСЃРёСЏ) РІС‹СЂР°Р¶РµРЅР° РІ СЃР°РјРѕР№
  // С‚Р°Р±Р»РёС†Рµ вЂ” РёРЅР°С‡Рµ РїРѕРІС‚РѕСЂРЅРѕРµ РЅР°Р¶Р°С‚РёРµ В«РІ РёР·Р±СЂР°РЅРЅРѕРµВ» РїР»РѕРґРёР»Рѕ Р±С‹ РґСѓР±Р»Рё, Рё РІ
  // СЃРїРёСЃРєРµ РѕРґРЅР° РІР°РєР°РЅСЃРёСЏ РїРѕСЏРІР»СЏР»Р°СЃСЊ Р±С‹ РґРІР°Р¶РґС‹.
  instance.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_user_job ON bookmarks(user_id, job_slug)",
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
  /** Р”Рѕ РєР°РєРѕРіРѕ РјРѕРјРµРЅС‚Р° hh РѕРіСЂР°РЅРёС‡РёР» Р°РєРєР°СѓРЅС‚ (0 вЂ” РѕРіСЂР°РЅРёС‡РµРЅРёСЏ РЅРµС‚). */
  autoapply_blocked_until: number;
  autoapply_block_reason: string;
  email_verified: number;
  email_verification_token: string | null;
  password_reset_token: string | null;
  password_reset_expires: number | null;
  /** РћР¶РёРґР°РЅРёРµ РїРѕ Р·Р°СЂРїР»Р°С‚Рµ; null вЂ” РЅРµ Р·Р°РґР°РЅРѕ, С„РёР»СЊС‚СЂ РїРѕ Р·Р°СЂРїР»Р°С‚Рµ РЅРµ РїСЂРёРјРµРЅСЏРµС‚СЃСЏ. */
  salary_expectation: number | null;
  /** РџСЂРµРґРїРѕС‡С‚РёС‚РµР»СЊРЅС‹Р№ РіРѕСЂРѕРґ; РїСѓСЃС‚Р°СЏ СЃС‚СЂРѕРєР° вЂ” РЅРµ Р·Р°РґР°РЅ. */
  city_preference: string;
  /** demo вЂ” РѕР±С‹С‡РЅС‹Р№ СЂРµР¶РёРј, live вЂ” hh РїРѕРґРєР»СЋС‡С‘РЅ Рё С‡РµР»РѕРІРµРє СЏРІРЅРѕ СЃРѕРіР»Р°СЃРёР»СЃСЏ. */
  mode: "demo" | "live";
};

export function getUserById(id: number): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function getUserByEmail(email: string): User | undefined {
  return db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase().trim()) as User | undefined;
}
