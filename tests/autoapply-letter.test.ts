import test, { before } from "node:test";
import assert from "node:assert/strict";

/**
 * Автоотклик отправляет сопроводительное письмо.
 *
 * Главная регрессия продукта. `hhProvider.apply` умеет отправлять письмо
 * (`payload.message`), раздел писем в кабинете написан, на главной
 * персонализированные письма заявлены как отличие сервиса — а автоотклик
 * передавал `message: undefined`. То есть не уходило НИ ОДНОГО письма.
 *
 * Проверяется не «функция вызвалась», а что уходит на сервер: `payload.message`
 * в теле POST /negotiations. Пустая строка и отсутствие поля — разные вещи,
 * и обе означают, что половина ценности не работает.
 *
 * Сеть перехватывается подменой `fetch`, поэтому тест видит настоящий путь
 * данных: автоотклик → hhProvider.apply → httpFetch → fetch.
 */

type Database = ReturnType<typeof import("../src/lib/db").createDatabase>;
let db: Database;
let runAutoApply: () => Promise<import("../src/lib/autoapply").AutoApplyRun>;
let resetPacing: () => void;

/** Вакансия в каталоге: создаём напрямую, чтобы не ждать сеть провайдеров. */
function seedVacancy(slug: string, title: string, skills: string[]) {
  db.prepare(
    `INSERT INTO vacancies (slug, source, source_id, title, company, salary, salary_min, salary_max,
      level, format, city, posted, category, about, responsibilities, requirements, bonus,
      source_url, contact_email, contact_phone, fetched_at)
     VALUES (?, 'hh', ?, ?, 'Тест', '200000', 200000, 250000, 'Middle', 'Удалённо', 'Москва',
      'сегодня', 'Разработка', ?, '[]', ?, '[]', NULL, NULL, NULL, ?)`,
  ).run(slug, slug.replace("hh-", ""), title, `Требуются: ${skills.join(", ")}`, JSON.stringify(skills), Date.now());
}

before(async () => {
  process.env.EZOFFER_DB_PATH = ":memory:";
  process.env.EZOFFER_SILENT = "1";
  // Паузер анти-бана разрешает отправку только в «рабочие часы» часового
  // пояса раннера (09:00–20:00). Ночной прогон в другом поясе обнулял
  // applied — suite падал от расписания, а не от кода. Окно раздвигаем
  // здесь: само расписание отдельно и явно проверяет anti-ban.test.ts.
  process.env.AUTOAPPLY_WORK_START = "1";
  process.env.AUTOAPPLY_WORK_END = "24";
  const dbMod = await import("../src/lib/db");
  db = dbMod.db;
  const aa = await import("../src/lib/autoapply");
  runAutoApply = aa.runAutoApply;
  resetPacing = aa.resetPacing;
});

/** Создаёт пользователя с hh-токеном, резюме, письмом и активным поиском. */
function seedUser(options: { letters?: { title: string; content: string }[]; resume?: string; keywords?: string }): number {
  const uid = Number(
    db
      .prepare(
        `INSERT INTO users (email, password_hash, plan, plan_expires_at, created_at, hh_token, hh_resume_id)
         VALUES (?, 'h', 'pro', ?, ?, 'user-token', 'res123')`,
      )
      .run(`u${Math.random().toString(36).slice(2)}@example.com`, Date.now() + 100000, Date.now())
      .lastInsertRowid,
  );

  db.prepare(
    `INSERT INTO resumes (user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(uid, "Frontend Developer", options.resume ?? "Опыт 5 лет. React, TypeScript, Next.js.", Date.now(), Date.now());

  for (const l of options.letters ?? []) {
    db.prepare("INSERT INTO letters (user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(uid, l.title, l.content, Date.now(), Date.now());
  }

  db.prepare(
    `INSERT INTO searches (user_id, title, keywords, active, started_at, created_at) VALUES (?, ?, ?, 1, ?, ?)`,
  ).run(uid, "s", options.keywords ?? "react", Date.now(), Date.now());

  return uid;
}

/**
 * Перехватывает POST /negotiations и возвращает тело запроса.
 *
 * Скорость ответа на POST /token нужна, потому что getValidHhToken может
 * обновить протухший токен.
 */
function interceptApplies(): { bodies: Record<string, unknown>[]; restore: () => void } {
  const bodies: Record<string, unknown>[] = [];
  const saved = globalThis.fetch;

  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/token")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: "user-token", expires_in: 3600 }),
      } as unknown as Response;
    }
    if (u.includes("/negotiations")) {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return { ok: true, status: 200, text: async () => "{}" } as unknown as Response;
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ items: [] }) } as unknown as Response;
  }) as typeof globalThis.fetch;

  return { bodies, restore: () => { globalThis.fetch = saved; } };
}

test("отклик уходит с письмом, а не без него", async () => {
  const uid = seedUser({
    letters: [
      { title: "Фронтенд", content: "Пишу на React и TypeScript, Next.js в продакшене." },
      { title: "Бэкенд", content: "Python, Django, PostgreSQL, микросервисы." },
    ],
  });
  seedVacancy("hh-react-1", "React-разработчик", ["React", "TypeScript"]);

  const net = interceptApplies();
  try {
    resetPacing();
    const result = await runAutoApply();
    assert.ok(result.applied > 0, "отклик не отправлен");

    assert.equal(net.bodies.length, result.applied, "число запросов не совпало с числом откликов");

    for (const body of net.bodies) {
      assert.equal(typeof body.message, "string", "в теле отклика нет поля message");
      const message = String(body.message ?? "");
      assert.ok(
        message.trim().length > 40,
        `письмо пустое или слишком короткое: ${JSON.stringify(message.slice(0, 60))}`,
      );
    }

    const row = db
      .prepare("SELECT message, letter_id FROM applications WHERE user_id = ?")
      .get(uid) as { message: string; letter_id: number | null };
    assert.ok(row.message.length > 40, "письмо не сохранено в applications");
    assert.ok(row.letter_id, "письмо не связано с откликом через letter_id");
  } finally {
    net.restore();
  }
});

test("выбирается письмо, релевантное вакансии", async () => {
  seedUser({
    letters: [
      { title: "Фронтенд", content: "Пишу на React и TypeScript, Next.js в продакшене." },
      { title: "Бэкенд", content: "Python, Django, PostgreSQL, микросервисы и очереди." },
    ],
    keywords: "react",
  });
  seedVacancy("hh-react-2", "React-разработчик", ["React", "TypeScript"]);

  const net = interceptApplies();
  try {
    resetPacing();
    await runAutoApply();
    assert.equal(net.bodies.length, 1, "ожидался один отклик");
    const message = String(net.bodies[0]!.message ?? "");
    assert.match(message, /React|TypeScript/i, `выбрано не то письмо: ${message.slice(0, 120)}`);
    assert.doesNotMatch(message, /Django|PostgreSQL/i, "выбрано письмо про бэкенд");
  } finally {
    net.restore();
  }
});

test("без сохранённых писем отклик всё равно уходит — с шаблоном", async () => {
  const uid = seedUser({ letters: [], keywords: "react" });
  seedVacancy("hh-react-3", "React-разработчик", ["React"]);

  const net = interceptApplies();
  try {
    resetPacing();
    await runAutoApply();
    assert.equal(net.bodies.length, 1, "отклик не отправлен без писем");
    const message = String(net.bodies[0]!.message ?? "");
    assert.ok(message.length > 40, "шаблонное письмо не подставлено");
    assert.match(message, /React/i, "в шаблонном письме нет названия вакансии");

    const row = db.prepare("SELECT message, letter_id FROM applications WHERE user_id = ?").get(uid) as {
      message: string;
      letter_id: number | null;
    };
    assert.ok(row.message.length > 40, "письмо не сохранено");
    assert.equal(row.letter_id, null, "шаблонное письмо не должно притворяться сохранённым");
  } finally {
    net.restore();
  }
});

test("отклик содержит достижение с цифрой из резюме", async () => {
  seedUser({
    letters: [],
    keywords: "react",
    resume: "Разработчик\nОпыт 5 лет\nСократил время загрузки приложения на 40%, LCP с 4.2с до 1.6с",
  });
  seedVacancy("hh-react-4", "React-разработчик", ["React"]);

  const net = interceptApplies();
  try {
    resetPacing();
    await runAutoApply();
    const message = String(net.bodies[0]?.message ?? "");
    assert.match(
      message,
      /40%|1\.6с|загрузк/i,
      `письмо не содержит достижения из резюме: ${message.slice(0, 160)}`,
    );
  } finally {
    net.restore();
  }
});

test("в статистике видно, сколько откликов ушло с письмом", async () => {
  seedUser({ letters: [], keywords: "react" });
  seedVacancy("hh-react-5", "React-разработчик", ["React"]);

  const net = interceptApplies();
  try {
    resetPacing();
    const result = await runAutoApply();
    assert.ok(result.applied > 0, "отклик не отправлен");
    assert.equal(result.withLetter, result.applied, "письмо не учтено в статистике прогона");
    assert.equal(result.withoutLetter, 0, "отклик без письма при наличии шаблона");
  } finally {
    net.restore();
  }
});