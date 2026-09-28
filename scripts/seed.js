/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * Демо-данные для кабинета EZOffer.
 * Запуск: npm run seed
 * Создаёт аккаунт demo@ezoffer.ru (пароль demo123) с резюме, письмом
 * и активным автопоиском. Отклики НЕ создаются — статистика отражает реальные данные.
 * Повторный запуск перезаписывает демо-аккаунт, не трогая других пользователей.
 */
const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");

const db = new Database(path.join(process.cwd(), "data", "ezoffer.db"), { timeout: 8000 });

db.pragma("journal_mode = WAL");
db.exec(`
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
CREATE TABLE IF NOT EXISTS telegram_codes (
  code TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
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
  sent_at INTEGER NOT NULL,
  viewed_at INTEGER,
  responded_at INTEGER,
  withdrawn INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS consultations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  theme TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  booked_at INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);
`);

const DAY = 24 * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const EMAIL = "demo@ezoffer.ru";
const PASSWORD = "demo123";
const now = Date.now();

const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(EMAIL);
let userId;
if (existing) {
  userId = existing.id;
  for (const t of ["sessions", "oauth_states", "consultations", "letters", "searches", "applications", "resumes"]) {
    db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userId);
  }
  db.prepare("UPDATE users SET name = ?, password_hash = ?, plan = ?, plan_period = ?, plan_activated_at = ?, plan_expires_at = ?, trial_started_at = ? WHERE id = ?").run(
    "Демо Пользователь",
    hashPassword(PASSWORD),
    "pro",
    14,
    now - 3 * DAY,
    now + 11 * DAY,
    now - 30 * DAY,
    userId,
  );
} else {
  const r = db
    .prepare("INSERT INTO users (email, name, password_hash, created_at, plan, plan_period, plan_activated_at, plan_expires_at, trial_started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      EMAIL,
      "Демо Пользователь",
      hashPassword(PASSWORD),
      now - 30 * DAY,
      "pro",
      14,
      now - 3 * DAY,
      now + 11 * DAY,
      now - 30 * DAY,
    );
  userId = Number(r.lastInsertRowid);
}

const resumeContent = [
  "Опыт работы",
  "- Frontend-разработчик, 3 года: React, TypeScript, Next.js",
  "- Спроектировал и внедрил дизайн-систему: ускорил выпуск фич на 30%",
  "- Оптимизировал загрузку приложения: LCP с 4.2с до 1.6с, конверсия +12%",
  "- Вёл код-ревью команды из 5 разработчиков",
  "",
  "Ключевые навыки",
  "- React, TypeScript, Next.js, Redux, GraphQL, Jest, Docker",
  "",
  "Образование",
  "- МГТУ им. Баумана, прикладная математика",
  "- Курсы: системный дизайн, performance-оптимизация",
].join("\n");

const letterContent = [
  "Здравствуйте!",
  "",
  "Меня заинтересовала вакансия {вакансия} в компании {компания}. Мой стек — React, TypeScript и Next.js, в последней роли я сократил LCP с 4.2с до 1.6с и ускорил выпуск фич на 30% за счёт дизайн-системы.",
  "",
  "С радостью расскажу подробнее на собеседовании. Резюме прикрепляю.",
  "",
  "С уважением, Демо Пользователь",
].join("\n");

db.prepare("INSERT INTO resumes (user_id, title, content, years_label, ai_improved, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)")
  .run(userId, "Frontend-разработчик, 3 года (React)", resumeContent, "3 года · Middle", now - 5 * DAY, now - 1 * DAY);

db.prepare("INSERT INTO letters (user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
  .run(userId, "Стандартное сопроводительное", letterContent, now - 5 * DAY, now - 2 * DAY);

db.prepare("INSERT INTO searches (user_id, title, keywords, salary_min, salary_max, format, city, level, company_blacklist, active, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)")
  .run(userId, "Frontend: автоотклики", "frontend, react, typescript", null, null, "Удалённо", "", "Middle", "", now - 1 * DAY, now - 1 * DAY);

db.prepare("INSERT INTO consultations (user_id, theme, note, booked_at, done) VALUES (?, ?, ?, ?, ?)")
  .run(userId, "Разбор резюме", "Хочу понять, почему откликов мало, а приглашений нет.", now - 2 * DAY, 1);

db.close();

console.log("");
console.log("Демо-аккаунт готов:");
console.log("  Email:    " + EMAIL);
console.log("  Пароль:   " + PASSWORD);
console.log("  Тариф:    Про, 14 дней (активен)");
console.log("  Откликов: 0 — статистика реальная, отклики отправляются только через hh.ru");
console.log("");
console.log("Вход: http://localhost:3000/login");