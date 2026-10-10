import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { loginAs, logout, post, write, readJson, useInMemoryDb } from "./helpers/route-session";

/**
 * Тесты API-роутов кабинета: авторизация, валидация и — главное — изоляция
 * данных между пользователями (IDOR).
 *
 * Раньше роуты проверялись только косвенно: логика проверки владения
 * ресурсом (WHERE id = ? AND user_id = ?) не имела ни одного теста, хотя именно
 * она защищает резюме, письма и автопоиски от чужих пользователей. Здесь каждый
 * такой случай закрыт явно.
 */

let db: ReturnType<typeof import("../src/lib/db").createDatabase>;

before(async () => {
  useInMemoryDb();
  db = (await import("../src/lib/db")).db;
});

beforeEach(() => {
  for (const table of ["resumes", "letters", "searches", "applications", "users"]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  loginAs();
});

function makeUser(id: number, email: string): void {
  db.prepare(
    "INSERT INTO users (id, email, password_hash, plan, plan_expires_at, created_at, email_verified) VALUES (?,?,?,?,?,?,1)",
  ).run(id, email, "h", "pro", Date.now() + 86_400_000, Date.now());
}

/** Резюме, принадлежащее userId. */
function makeResume(userId: number, title = "Резюме"): number {
  return Number(
    db
      .prepare(
        "INSERT INTO resumes (user_id, title, content, created_at, updated_at) VALUES (?,?,?,?,?)",
      )
      .run(userId, title, "Опыт работы\n- React", Date.now(), Date.now()).lastInsertRowid,
  );
}

/** Письмо, принадлежащее userId. */
function makeLetter(userId: number, title = "Письмо"): number {
  return Number(
    db
      .prepare(
        "INSERT INTO letters (user_id, title, content, created_at, updated_at) VALUES (?,?,?,?,?)",
      )
      .run(userId, title, "Здравствуйте", Date.now(), Date.now()).lastInsertRowid,
  );
}

// ---------------------------------------------------------------- auth guards

test("GET /api/resumes без сессии → 401", async () => {
  logout();
  const { GET } = await import("../src/app/api/resumes/route");
  assert.equal((await GET()).status, 401);
});

test("GET /api/letters без сессии → 401", async () => {
  logout();
  const { GET } = await import("../src/app/api/letters/route");
  assert.equal((await GET()).status, 401);
});

test("GET /api/applications без сессии → 401", async () => {
  logout();
  const { GET } = await import("../src/app/api/applications/route");
  const res = await GET(new Request("http://localhost/api/applications"));
  assert.equal(res.status, 401);
});

test("GET /api/searches без сессии → 401", async () => {
  logout();
  const { GET } = await import("../src/app/api/searches/route");
  assert.equal((await GET()).status, 401);
});

test("GET /api/stats без сессии → 401", async () => {
  logout();
  const { GET } = await import("../src/app/api/stats/route");
  assert.equal((await GET()).status, 401);
});

// ------------------------------------------------------------------- resumes

test("POST /api/resumes сохраняет резюме текущего пользователя", async () => {
  makeUser(1, "me@example.test");
  const { POST } = await import("../src/app/api/resumes/route");
  const res = await POST(post({ title: "Frontend", content: "React, TypeScript" }));
  assert.equal(res.status, 201);

  const row = db.prepare("SELECT * FROM resumes").get() as { user_id: number; title: string };
  assert.equal(row.user_id, 1);
  assert.equal(row.title, "Frontend");
});

test("POST /api/resumes обрезает слишком длинные поля", async () => {
  makeUser(1, "me@example.test");
  const { POST } = await import("../src/app/api/resumes/route");
  await POST(post({ title: "T".repeat(500), content: "C".repeat(50_000) }));

  const row = db.prepare("SELECT * FROM resumes").get() as { title: string; content: string };
  assert.equal(row.title.length, 100);
  assert.equal(row.content.length, 20_000);
});

test("POST /api/resumes отклоняет пустое содержимое", async () => {
  makeUser(1, "me@example.test");
  const { POST } = await import("../src/app/api/resumes/route");
  assert.equal((await POST(post({ title: "", content: "" }))).status, 400);
  assert.equal((await POST(post({}))).status, 400);
});

test("чужое резюме нельзя изменить (IDOR)", async () => {
  makeUser(1, "me@example.test");
  makeUser(2, "other@example.test");
  const foreignId = makeResume(2, "Чужое резюме");

  const { PUT, DELETE } = await import("../src/app/api/resumes/[id]/route");
  const ctx = { params: Promise.resolve({ id: String(foreignId) }) };

  assert.equal((await PUT(post({ title: "Взлом", content: "Взлом" }), ctx)).status, 404);
  assert.equal((await DELETE(new Request("http://x"), ctx)).status, 404);

  // Запись не изменилась и не удалена.
  const row = db.prepare("SELECT * FROM resumes WHERE id = ?").get(foreignId) as { title: string };
  assert.equal(row.title, "Чужое резюме");
});

test("своё резюме можно изменить и удалить", async () => {
  makeUser(1, "me@example.test");
  const ownId = makeResume(1, "Моё");

  const { PUT, DELETE } = await import("../src/app/api/resumes/[id]/route");
  const ctx = { params: Promise.resolve({ id: String(ownId) }) };

  assert.equal((await PUT(post({ title: "Новое", content: "Новый текст" }), ctx)).status, 200);
  const row = db.prepare("SELECT * FROM resumes WHERE id = ?").get(ownId) as { title: string };
  assert.equal(row.title, "Новое");

  assert.equal((await DELETE(new Request("http://x"), ctx)).status, 200);
  assert.equal((db.prepare("SELECT COUNT(*) c FROM resumes WHERE id = ?").get(ownId) as { c: number }).c, 0);
});

test("некорректный id резюме отклоняется до обращения к БД", async () => {
  const { PUT } = await import("../src/app/api/resumes/[id]/route");
  for (const bad of ["abc", "0", "-1", "1.5", ""]) {
    const ctx = { params: Promise.resolve({ id: bad }) };
    assert.equal((await PUT(post({ title: "x", content: "y" }), ctx)).status, 400, `id=${bad}`);
  }
});

test("GET /api/resumes показывает только свои резюме", async () => {
  makeUser(1, "me@example.test");
  makeUser(2, "other@example.test");
  makeResume(1, "Моё");
  makeResume(2, "Чужое");

  const { GET } = await import("../src/app/api/resumes/route");
  const body = (await (await GET()).json()) as { resumes: { user_id: number }[] };
  assert.equal(body.resumes.length, 1);
  assert.equal(body.resumes[0]?.user_id, 1);
});

// ------------------------------------------------------------------- letters

test("чужое письмо нельзя изменить (IDOR)", async () => {
  makeUser(1, "me@example.test");
  makeUser(2, "other@example.test");
  const foreignId = makeLetter(2, "Чужое письмо");

  const { PUT, DELETE } = await import("../src/app/api/letters/[id]/route");
  const ctx = { params: Promise.resolve({ id: String(foreignId) }) };

  assert.equal((await PUT(post({ title: "Взлом", content: "Взлом" }), ctx)).status, 404);
  assert.equal((await DELETE(new Request("http://x"), ctx)).status, 404);

  const row = db.prepare("SELECT * FROM letters WHERE id = ?").get(foreignId) as { title: string };
  assert.equal(row.title, "Чужое письмо");
});

test("POST /api/letters обрезает и проверяет поля", async () => {
  makeUser(1, "me@example.test");
  const { POST } = await import("../src/app/api/letters/route");
  assert.equal((await POST(post({ title: "", content: "x" }))).status, 400);

  await POST(post({ title: "T".repeat(300), content: "C".repeat(30_000) }));
  const row = db.prepare("SELECT * FROM letters").get() as { title: string; content: string };
  assert.equal(row.title.length, 100);
  assert.equal(row.content.length, 20_000);
});

// ------------------------------------------------------------------ searches

test("чужой автопоиск нельзя изменить (IDOR)", async () => {
  makeUser(1, "me@example.test");
  makeUser(2, "other@example.test");
  const foreignId = Number(
    db
      .prepare(
        "INSERT INTO searches (user_id, title, keywords, active, created_at) VALUES (?,?,?,0,?)",
      )
      .run(2, "Чужой поиск", "react", Date.now()).lastInsertRowid,
  );

  const { PUT, DELETE } = await import("../src/app/api/searches/[id]/route");
  const ctx = { params: Promise.resolve({ id: String(foreignId) }) };

  assert.equal((await PUT(write("PUT", { active: true }), ctx)).status, 404);
  assert.equal((await DELETE(new Request("http://x"), ctx)).status, 404);

  const row = db.prepare("SELECT * FROM searches WHERE id = ?").get(foreignId) as { active: number };
  assert.equal(row.active, 0, "чужой поиск не должен активироваться");
});

test("POST /api/searches проверяет диапазон зарплаты", async () => {
  makeUser(1, "me@example.test");
  const { POST } = await import("../src/app/api/searches/route");
  const bad = await POST(post({ title: "S", salary_min: 300_000, salary_max: 100_000 }));
  assert.equal(bad.status, 400);
  assert.match((await readJson(bad)).error ?? "", /зарплат/i);

  assert.equal((await POST(post({ title: "S", salary_min: 100_000, salary_max: 300_000 }))).status, 201);
});

test("POST /api/searches обрезает длинные строки", async () => {
  makeUser(1, "me@example.test");
  const { POST } = await import("../src/app/api/searches/route");
  await POST(post({ title: "T".repeat(300), keywords: "K".repeat(1000), city: "C".repeat(200) }));
  const row = db.prepare("SELECT * FROM searches").get() as {
    title: string;
    keywords: string;
    city: string;
  };
  assert.equal(row.title.length, 100);
  assert.equal(row.keywords.length, 400);
  assert.equal(row.city.length, 60);
});

// --------------------------------------------------------------- applications

test("PATCH /api/applications не меняет чужой отклик (IDOR)", async () => {
  makeUser(1, "me@example.test");
  makeUser(2, "other@example.test");
  const foreignId = Number(
    db
      .prepare(
        "INSERT INTO applications (user_id, job_slug, status, sent_at) VALUES (?,?,?,?)",
      )
      .run(2, "slug-1", "sent", Date.now()).lastInsertRowid,
  );

  const { PATCH } = await import("../src/app/api/applications/[id]/route");
  const ctx = { params: Promise.resolve({ id: String(foreignId) }) };
  const res = await PATCH(
    write("PATCH", { externalUrl: "https://evil.example" }),
    ctx,
  );
  assert.equal(res.status, 404);

  const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(foreignId) as {
    external_url: string | null;
  };
  assert.equal(row.external_url, null);
});

test("PATCH /api/applications отклоняет не-http ссылку", async () => {
  makeUser(1, "me@example.test");
  const ownId = Number(
    db
      .prepare("INSERT INTO applications (user_id, job_slug, status, sent_at) VALUES (?,?,?,?)")
      .run(1, "slug-2", "sent", Date.now()).lastInsertRowid,
  );

  const { PATCH } = await import("../src/app/api/applications/[id]/route");
  const ctx = { params: Promise.resolve({ id: String(ownId) }) };

  // javascript: попал бы в БД как href и выполнился бы по клику.
  const res = await PATCH(write("PATCH", { externalUrl: "javascript:alert(1)" }), ctx);
  assert.equal(res.status, 400);

  const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(ownId) as {
    external_url: string | null;
  };
  assert.equal(row.external_url, null);
});

test("DELETE /api/applications помечает отозванным, а не удаляет", async () => {
  makeUser(1, "me@example.test");
  const ownId = Number(
    db
      .prepare("INSERT INTO applications (user_id, job_slug, status, sent_at) VALUES (?,?,?,?)")
      .run(1, "slug-3", "sent", Date.now()).lastInsertRowid,
  );

  const { DELETE } = await import("../src/app/api/applications/[id]/route");
  const ctx = { params: Promise.resolve({ id: String(ownId) }) };
  assert.equal((await DELETE(new Request("http://x"), ctx)).status, 200);

  const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(ownId) as {
    withdrawn: number;
  };
  assert.equal(row.withdrawn, 1, "строка должна сохраниться для статистики");
});

test("GET /api/applications уважает limit и не отдаёт чужие", async () => {
  makeUser(1, "me@example.test");
  makeUser(2, "other@example.test");
  for (let i = 0; i < 5; i++) {
    db.prepare(
      "INSERT INTO applications (user_id, job_slug, status, sent_at) VALUES (?,?,?,?)",
    ).run(1, `mine-${i}`, "sent", Date.now() - i * 1000);
    db.prepare(
      "INSERT INTO applications (user_id, job_slug, status, sent_at) VALUES (?,?,?,?)",
    ).run(2, `theirs-${i}`, "sent", Date.now() - i * 1000);
  }

  const { GET } = await import("../src/app/api/applications/route");
  const res = await GET(new Request("http://localhost/api/applications?limit=3"));
  const body = (await res.json()) as { applications: { job_slug: string }[] };

  assert.equal(body.applications.length, 3, "limit должен применяться");
  assert.ok(
    body.applications.every((a) => a.job_slug.startsWith("mine-")),
    "чужие отклики не должны попадать в выдачу",
  );
});

// ------------------------------------------------------------------ plan/trial

test("POST /api/plan отклоняет неизвестный тариф и период", async () => {
  const { POST } = await import("../src/app/api/plan/route");
  assert.equal((await POST(post({ planId: "gold", period: 14 }))).status, 400);
  assert.equal((await POST(post({ planId: "pro", period: 999 }))).status, 400);
});

test("POST /api/trial не выдаётся дважды", async () => {
  // Пробный период положен только тем, у кого нет платного тарифа.
  // Строка пользователя в БД обязательна: роут перечитывает её после записи.
  makeUser(1, "me@example.test");
  loginAs({ plan: "none", trial_started_at: null });

  const { POST } = await import("../src/app/api/trial/route");
  const first = await POST();
  assert.equal(first.status, 200);

  // Второй раз — уже использованный пробный период.
  loginAs({ plan: "none", trial_started_at: Date.now() });
  const second = await POST();
  assert.equal(second.status, 409);
});

test("POST /api/trial недоступен при активном платном тарифе", async () => {
  makeUser(1, "me@example.test");
  loginAs({ plan: "pro", trial_started_at: null });
  const { POST } = await import("../src/app/api/trial/route");
  const res = await POST();
  assert.equal(res.status, 409);
  assert.match((await readJson(res)).error ?? "", /тариф/i);
});

/**
 * Регрессия: роут брал строку пользователя как `as User` и сразу обращался
 * к полям. Если строки нет (аккаунт удалён или БД восстановлена из бэкапа
 * между проверкой сессии и записью), `updated.plan` кидал TypeError, и
 * клиент получал 500. Теперь это корректный 401 — сессия недействительна.
 */
test("исчезновение строки пользователя даёт 401, а не 500", async () => {
  loginAs({ plan: "none", trial_started_at: null, id: 999 });
  db.prepare("DELETE FROM users WHERE id = 999").run();

  const { POST } = await import("../src/app/api/trial/route");
  const res = await POST();
  assert.equal(res.status, 401, `ожидался 401, получено ${res.status}`);
});

test("аналогично для /api/plan и /api/hh/status", async () => {
  loginAs({ id: 998 });
  db.prepare("DELETE FROM users WHERE id = 998").run();

  const plan = await import("../src/app/api/plan/route");
  const planRes = await plan.POST(post({ planId: "pro", period: 14 }));
  assert.equal(planRes.status, 401);

  loginAs({ id: 998 });
  const hh = await import("../src/app/api/hh/status/route");
  const hhRes = await hh.GET();
  assert.equal(hhRes.status, 401);
});

// -------------------------------------------------------------------- profile

test("POST /api/plan требует авторизации", async () => {
  logout();
  const { POST } = await import("../src/app/api/plan/route");
  assert.equal((await POST(post({ planId: "pro", period: 14 }))).status, 401);
});

test("PUT /api/profile требует текущий пароль для смены email", async () => {
  makeUser(1, "me@example.test");
  const { PUT } = await import("../src/app/api/profile/route");

  // Без пароля — отказ.
  const noPass = await PUT(write("PUT", { email: "new@example.test" }));
  assert.equal(noPass.status, 403);

  // С паролем — email занят другим аккаунтом.
  makeUser(2, "taken@example.test");
  const taken = await PUT(
    write("PUT", { email: "taken@example.test", currentPassword: "old" }),
  );
  assert.equal(taken.status, 409);

  // С валидным паролем и свободным email — успех.
  const ok = await PUT(
    write("PUT", { email: "fresh@example.test", currentPassword: "old" }),
  );
  assert.equal(ok.status, 200);
});
