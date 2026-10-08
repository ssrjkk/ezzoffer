import test from "node:test";
import assert from "node:assert/strict";

import { isHttpsRequest } from "../src/lib/auth";

/**
 * proxy.ts ротировал сессионную cookie и выставлял secure через точное сравнение
 * `x-forwarded-proto === "https"`. В цепочке прокси (nginx + CDN) заголовок
 * приходит списком ("https, http"), и флаг Secure снимался — cookie уходила
 * по HTTP. isHttpsRequest берёт первый элемент списка, как в login/register.
 */
function req(headers: Record<string, string>, url = "http://localhost:3000/dashboard"): Request {
  return new Request(url, { headers });
}

test("прямое сравнение ломало бы на списке прокси (regression)", () => {
  const list = req({ "x-forwarded-proto": "https, http" });
  assert.equal(
    list.headers.get("x-forwarded-proto") === "https",
    false,
    "старая проверка сняла бы Secure",
  );
  assert.equal(isHttpsRequest(list), true, "новая корректно распознаёт https");
});

test("https в заголовке распознаётся", () => {
  assert.equal(isHttpsRequest(req({ "x-forwarded-proto": "https" })), true);
});

test("http в заголовке не считается https", () => {
  assert.equal(isHttpsRequest(req({ "x-forwarded-proto": "http" })), false);
});

test("https берётся из URL, когда заголовка нет", () => {
  assert.equal(isHttpsRequest(req({}, "https://ezoffer.ru/dashboard")), true);
  assert.equal(isHttpsRequest(req({}, "http://localhost:3000/dashboard")), false);
});

test("http-URL с https-заголовком считается https", () => {
  // Типичный случай: приложение за TLS-терминацией, но внутри Next видит http.
  assert.equal(isHttpsRequest(req({ "x-forwarded-proto": "https" }, "http://internal:3000/")), true);
});

test("http-URL с http-заголовком остаётся http", () => {
  assert.equal(isHttpsRequest(req({ "x-forwarded-proto": "http" }, "http://internal:3000/")), false);
});

test("отсутствие заголовков не считается https", () => {
  assert.equal(isHttpsRequest(req({})), false);
});
