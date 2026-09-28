import test from "node:test";
import assert from "node:assert/strict";
import { matchesSearch } from "../src/lib/matcher";
import type { Vacancy } from "../src/lib/vacancies/types";
import type { SearchRow } from "../src/lib/matcher";

const makeVacancy = (over: Partial<Vacancy> = {}): Vacancy => ({
  slug: "local-1",
  source: "local",
  source_id: "1",
  title: "Frontend-разработчик",
  company: "ООО Тест",
  city: "Москва",
  level: "Middle",
  format: "Удалённо",
  category: "Разработка",
  salary_min: 150000,
  salary_max: 200000,
  salary: "150000–200000",
  posted: "сегодня",
  about: "Описание",
  responsibilities: [],
  requirements: [],
  bonus: [],
  source_url: null,
  contact_email: null,
  contact_phone: null,
  ...over,
});

const baseSearch = (over: Partial<SearchRow> = {}): SearchRow => ({
  id: 1,
  user_id: 1,
  title: "S",
  keywords: "",
  salary_min: null,
  salary_max: null,
  format: "",
  city: "",
  level: "",
  company_blacklist: "",
  active: 1,
  started_at: null,
  created_at: 0,
  ...over,
});

test("matchesSearch по ключевым словам", () => {
  const v = makeVacancy();
  assert.equal(matchesSearch(v, baseSearch({ keywords: "frontend" })), true);
  assert.equal(matchesSearch(v, baseSearch({ keywords: "react" })), false);
  assert.equal(matchesSearch(v, baseSearch({ keywords: "" })), true);
});

test("matchesSearch фильтрует по уровню/формату/городу", () => {
  const v = makeVacancy({
    title: "QA",
    city: "Санкт-Петербург",
    level: "Senior",
    format: "В офисе",
    category: "Тестирование",
    salary_min: 100000,
    salary_max: null,
  });
  assert.equal(matchesSearch(v, baseSearch({ level: "Senior" })), true);
  assert.equal(matchesSearch(v, baseSearch({ level: "Middle" })), false);
  assert.equal(matchesSearch(v, baseSearch({ format: "В офисе" })), true);
  assert.equal(matchesSearch(v, baseSearch({ format: "Удалённо" })), false);
  assert.equal(matchesSearch(v, baseSearch({ city: "петербург" })), true);
  assert.equal(matchesSearch(v, baseSearch({ city: "Москва" })), false);
});

test("matchesSearch фильтрует по зарплате и блэклисту", () => {
  const v = makeVacancy({
    title: "Dev",
    company: "Яндекс",
    level: "Junior",
    format: "Гибрид",
    salary_min: 120000,
    salary_max: null,
  });
  assert.equal(matchesSearch(v, baseSearch({ salary_min: 100000 })), true);
  assert.equal(matchesSearch(v, baseSearch({ salary_min: 150000 })), false);
  assert.equal(matchesSearch(v, baseSearch({ salary_max: 90000 })), false);
  assert.equal(matchesSearch(v, baseSearch({ company_blacklist: "яндекс" })), false);
  assert.equal(matchesSearch(v, baseSearch({ company_blacklist: "сбер" })), true);
});