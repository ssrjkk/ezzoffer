import { test } from "node:test";
import assert from "node:assert/strict";

import { rankLettersForVacancy, scoreVacancyForResume } from "../src/lib/ai-matching";
import type { Vacancy } from "../src/lib/vacancies/types";

function makeVacancy(overrides: Partial<Vacancy> = {}): Vacancy {
  return {
    slug: "hh-1",
    source: "hh",
    source_id: "1",
    title: "Senior React Developer",
    company: "Acme",
    salary: "200000-250000",
    salary_min: 200000,
    salary_max: 250000,
    level: "Senior",
    format: "Удалённо",
    city: "Москва",
    posted: "2026-01-01",
    category: "Разработка",
    about: "Команда ищет разработчика с опытом работы 3 лет в команде.",
    responsibilities: [],
    requirements: ["React", "TypeScript", "Next.js"],
    bonus: [],
    source_url: "https://hh.ru/vacancy/1",
    contact_email: null,
    contact_phone: null,
    ...overrides,
  };
}

test("scoreVacancyForResume растёт при совпадении навыков", () => {
  const vacancy = makeVacancy();
  const strong = scoreVacancyForResume(
    vacancy,
    "Senior React Developer. Опыт 5 лет. React, TypeScript, Next.js, Node.js.",
    "Senior Frontend Developer",
  );
  const weak = scoreVacancyForResume(vacancy, "Junior дизайнер, Figma", "Junior Designer");

  assert.ok(strong.matchedSkills.includes("react"));
  assert.ok(strong.score > weak.score, `${strong.score} должно быть больше ${weak.score}`);
  assert.ok(strong.score <= 100 && strong.score >= 0);
});

test("scoreVacancyForResume устойчив к вакансии без требований", () => {
  const vacancy = makeVacancy({ requirements: [], about: "" });
  const scored = scoreVacancyForResume(vacancy, "React", "Dev");
  assert.ok(Number.isFinite(scored.score));
  // Навыки берутся и из заголовка, поэтому React в названии вакансии находится.
  assert.deepEqual(scored.matchedSkills, ["react"]);
});

test("rankLettersForVacancy ставит письмо с нужными навыками выше", () => {
  const vacancy = makeVacancy();
  const ranked = rankLettersForVacancy(
    [
      { id: 1, content: "Занялся рисовкой иконок в Figma, люблю Photoshop." },
      { id: 2, content: "Пишу на React и TypeScript, Next.js в продакшене, Node.js." },
    ],
    vacancy,
  );

  assert.equal(ranked[0].id, 2);
  assert.ok(ranked[0].score > ranked[1].score);
});

test("rankLettersForVacancy не падает на пустом списке", () => {
  assert.deepEqual(rankLettersForVacancy([], makeVacancy()), []);
});

test("rankLettersForVacancy детерминирован при равных оценках", () => {
  const letters = [
    { id: 10, content: "React" },
    { id: 20, content: "React" },
    { id: 30, content: "React" },
  ];
  const first = rankLettersForVacancy(letters, makeVacancy()).map((l) => l.id);
  const second = rankLettersForVacancy(letters, makeVacancy()).map((l) => l.id);
  assert.deepEqual(first, second);
});
