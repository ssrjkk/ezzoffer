import test from "node:test";
import assert from "node:assert/strict";

import {
  authMethod,
  authMethods,
  authMethodReady,
  normalizeIdentity,
} from "../src/lib/auth-methods";

/**
 * Способы входа описаны данными, а вход из внешнего сервиса нормализуется.
 *
 * Главное здесь — недоверенный ввод. Имя, почта и аватар приходят от чужого
 * сервиса, а `email` у нас UNIQUE: без проверки формы один человек с пустым
 * адресом занял бы чужой логин, а имя с управляющими символами уехало бы в
 * письма и в разметку.
 */

test("способы входа перечислены и у каждого есть название", () => {
  const ids = authMethods().map((m) => m.id);
  for (const expected of ["password", "link", "github", "google", "yandex", "telegram"]) {
    assert.ok(ids.includes(expected as never), `способ ${expected} не зарегистрирован`);
    assert.ok(authMethod(expected)?.title, `у способа ${expected} нет названия`);
  }
});

test("внутренние способы готовы без ключей, внешние — нет", () => {
  const saved = { ...process.env };
  try {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    assert.equal(authMethodReady("password"), true, "пароль должен работать без ключей");
    assert.equal(authMethodReady("link"), true, "вход по ссылке должен работать без ключей");
    assert.equal(authMethodReady("github"), false, "GitHub без ключей заявил готовность");
  } finally {
    process.env = saved;
  }
});

test("внешний способ готов, когда оба ключа на месте", () => {
  const saved = process.env.GITHUB_CLIENT_ID;
  const savedSecret = process.env.GITHUB_CLIENT_SECRET;
  try {
    process.env.GITHUB_CLIENT_ID = "id";
    process.env.GITHUB_CLIENT_SECRET = "secret";
    assert.equal(authMethodReady("github"), true);
  } finally {
    if (saved === undefined) delete process.env.GITHUB_CLIENT_ID;
    else process.env.GITHUB_CLIENT_ID = saved;
    if (savedSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET;
    else process.env.GITHUB_CLIENT_SECRET = savedSecret;
  }
});

test("почта без формы не заводит аккаунт", () => {
  for (const bad of ["", "  ", "нет@", "@нет.ру", "два@знака@ру", "нет ру", "a".repeat(250) + "@ru"]) {
    const out = normalizeIdentity({ provider: "github", providerId: "1", email: bad, name: "Иван" });
    assert.equal(out, null, `мусорная почта «${bad}» прошла: ${JSON.stringify(out)}`);
  }
});

test("почта приводится к нижнему регистру и обрезается", () => {
  const out = normalizeIdentity({
    provider: "google",
    providerId: "42",
    email: "  User@Example.COM  ",
    name: "Иван",
  });
  assert.ok(out);
  assert.equal(out.email, "user@example.com");
});

test("имя без управляющих символов и лишних пробелов", () => {
  const out = normalizeIdentity({
    provider: "yandex",
    providerId: "7",
    email: "a@b.ru",
    name: "  Иван\u0000\u0007   Петров  ",
  });
  assert.ok(out);
  assert.equal(out.name, "Иван Петров", `имя не очищено: ${JSON.stringify(out.name)}`);
});

test("имя из чужого сервиса ограничено по длине", () => {
  const out = normalizeIdentity({
    provider: "github",
    providerId: "1",
    email: "a@b.ru",
    name: "я".repeat(400),
  });
  assert.ok(out);
  assert.equal(out.name.length, 100);
});

test("аватар принимается только с https и известного хоста", () => {
  const good = normalizeIdentity({
    provider: "github",
    providerId: "1",
    email: "a@b.ru",
    name: "Иван",
    avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
  });
  assert.ok(good?.avatarUrl?.startsWith("https://avatars.githubusercontent.com/"));

  for (const bad of [
    "http://avatars.githubusercontent.com/u/1", // не https
    "https://evil.example.com/x.png", // чужой хост
    "javascript:alert(1)",
    "не url",
  ]) {
    const out = normalizeIdentity({
      provider: "github",
      providerId: "1",
      email: "a@b.ru",
      name: "Иван",
      avatarUrl: bad,
    });
    assert.equal(out?.avatarUrl, undefined, `аватар «${bad}» принят`);
  }
});

test("неизвестный провайдер и пустой providerId не проходят", () => {
  assert.equal(
    normalizeIdentity({ provider: "кварс", providerId: "1", email: "a@b.ru" }),
    null,
  );
  assert.equal(
    normalizeIdentity({ provider: "github", providerId: "", email: "a@b.ru" }),
    null,
  );
});