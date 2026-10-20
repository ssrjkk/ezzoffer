import test from "node:test";
import assert from "node:assert/strict";

/**
 * Логика sitemap/robots. Раньше base = process.env.SITE_URL ?? "https://ezoffer.ru",
 * а SITE_URL= в .env.example пустой: `??` на пустой строке не срабатывает, и
 * sitemap получался с относительными url ("/jobs"), который невалиден.
 */
function resolveBase(siteUrl: string | undefined): string {
  return (siteUrl?.trim() || "https://ezoffer.ru").replace(/\/$/, "");
}

function buildUrls(siteUrl: string | undefined, dynamic: string[]): string[] {
  const base = resolveBase(siteUrl);
  return ["", "/faq", ...dynamic].map((route) => `${base}${route}`);
}

test("пустой SITE_URL даёт валидный абсолютный base", () => {
  assert.equal(resolveBase(""), "https://ezoffer.ru");
  assert.equal(resolveBase("   "), "https://ezoffer.ru");
  assert.equal(resolveBase(undefined), "https://ezoffer.ru");
});

test("непустой SITE_URL уважается, хвостовой слэш убирается", () => {
  assert.equal(resolveBase("http://localhost:3000"), "http://localhost:3000");
  assert.equal(resolveBase("http://localhost:3000/"), "http://localhost:3000");
  assert.equal(resolveBase("  https://ezoffer.ru/  "), "https://ezoffer.ru");
});

test("все URL sitemap абсолютные даже с пустым SITE_URL (regression)", () => {
  for (const url of buildUrls("", ["/jobs/a", "/blog/b"])) {
    // Протокол читаем через URL, а не `startsWith('http')`: подстроку «http»
    // проходит и «httpfoo://…», и относительный путь, начинающийся с http.
    assert.equal(
      new URL(url).protocol,
      "https:",
      `${url} должен быть абсолютным https`,
    );
    assert.ok(
      url === "https://ezoffer.ru" || url.startsWith("https://ezoffer.ru/"),
      `${url} потерял базовый домен`,
    );
  }
});

test("главная страница не получает двойной слэш", () => {
  assert.equal(buildUrls("https://ezoffer.ru/", [])[0], "https://ezoffer.ru");
  assert.equal(buildUrls("", [])[0], "https://ezoffer.ru");
});

test("динамические маршруты попадают в sitemap", () => {
  const urls = buildUrls("https://ezoffer.ru", [
    "/jobs/dev",
    "/blog/post",
    "/resume-examples/cv",
  ]);
  // Сравниваем разобранный URL, а не подстроку: `includes('https://ezoffer.ru/jobs/dev')`
  // прошла бы и на чужом хосте, и на `/jobs/dev/..`, то есть проверяла бы не то.
  const parsed = urls.map((url) => new URL(url));
  for (const path of ["/jobs/dev", "/blog/post", "/resume-examples/cv"]) {
    assert.ok(
      parsed.some(
        (u) =>
          u.protocol === "https:" &&
          u.hostname === "ezoffer.ru" &&
          u.pathname === path,
      ),
      `в sitemap нет ${path}: ${urls.join(" ")}`,
    );
  }
});

test("robots закрывает приватные зоны", () => {
  const disallow = ["/dashboard", "/api/", "/login", "/signup"];
  assert.ok(
    disallow.includes("/dashboard"),
    "кабинет не должен индексироваться",
  );
  assert.ok(
    disallow.some((d) => d.startsWith("/api")),
    "API не должен индексироваться",
  );
});
