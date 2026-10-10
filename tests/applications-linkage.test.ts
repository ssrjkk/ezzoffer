import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Регрессия на запись связанных сущностей в applications.
 *
 * В POST /api/applications в БД писались `data.letterId` и `data.resumeId` —
 * то есть значения из тела запроса, которые при автоподборе равны null.
 * При этом реально использованные письмо и резюме вычислялись отдельно
 * (selectedLetterId и последнее обновлённое резюме) — и именно они уходили в hh.ru.
 *
 * Итог: в кабинете отклик отображался «без резюме и письма», хотя был реально
 * отправлен с ними, а история «каким письмом откликнулись» оставалась пустой.
 *
 * Полный вызов POST требует HTTP-контекста и сессии, поэтому проверяем исходник
 * роута. Регулярные выражения терпимы к переносам строк и отступам, чтобы
 * переформатирование файла не роняло тест по ложной причине.
 */

const ROUTE = readFileSync("src/app/api/applications/route.ts", "utf8");

test("INSERT в applications существует", () => {
  assert.ok(ROUTE.includes("INSERT INTO applications"));
});

test("letter_id записывается из вычисленного selectedLetterId", () => {
  // В блоке .run(...) после selectedLetterId должен идти message, а не data.letterId.
  assert.ok(
    /selectedLetterId,\s*message,/.test(ROUTE),
    "letter_id должен записываться из selectedLetterId",
  );
  assert.ok(
    !/data\?\.letterId\s*\?\?\s*null,\s*message/.test(ROUTE),
    "letter_id из тела запроса не должен попадать в INSERT",
  );
});

test("resume_id записывается из фактически использованного resumeIdUsed", () => {
  assert.ok(
    /resumeIdUsed,\s*selectedLetterId,/.test(ROUTE),
    "resume_id должен записываться из фактически использованного резюме",
  );
  assert.ok(
    !/data\?\.resumeId\s*\?\?\s*null,\s*selectedLetterId,/.test(ROUTE),
    "resume_id из тела запроса не должен попадать в INSERT",
  );
});

test("выбор резюме учитывает fallback на последнее обновлённое", () => {
  assert.ok(
    /resumeIdUsed\s*=\s*resumeRow\?\.id\s*\?\?\s*null/.test(ROUTE),
    "идентификатор резюме берётся из фактически выбранной строки",
  );
  assert.ok(
    ROUTE.includes("ORDER BY updated_at DESC LIMIT 1"),
    "при автовыборе берётся последнее обновлённое резюме",
  );
});

test("персонализированное письмо сохраняется и отправляется одно и то же", () => {
  assert.ok(
    /message\s*=\s*\(await personalizeLetter\(template, vacancy, resumeContent\)\)\.content/.test(ROUTE),
    "персонализация использует выбранное письмо",
  );
  assert.ok(
    /message:\s*message\s*\|\|\s*undefined/.test(ROUTE),
    "в hh.ru уходит то же сообщение, что сохраняется в БД",
  );
  assert.ok(
    /selectedLetterId,\s*message,/.test(ROUTE),
    "в БД сохраняется то же message, что отправлено в hh.ru",
  );
});

test("выбранный letterId валидируется на принадлежность пользователю", () => {
  // Чужой letterId должен отбрасываться, а не записываться в applications.
  assert.ok(
    /selectedLetterId\s*!=\s*null\s*&&\s*!letters\.some/.test(ROUTE),
    "неизвестный letterId сбрасывается в null",
  );
});
