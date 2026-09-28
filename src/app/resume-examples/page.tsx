import type { Metadata } from "next";
import Link from "next/link";
import { resumeExamples } from "@/lib/data";

export const metadata: Metadata = {
  title: "Примеры резюме, которые проходят ATS",
  description:
    "Готовые примеры резюме по IT-ролям: Frontend, Backend, QA. Структура, ключевые слова и формулировки, которые нравятся рекрутерам и ATS-системам.",
};

export default function ResumeExamplesPage() {
  return (
    <div className="container-x py-12 md:py-16">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent-2">Инструменты</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          Примеры резюме, которые проходят ATS
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Готовые структуры резюме для популярных IT-ролей. Используйте их как шаблон: замените данные своими,
          сохранив формулировки с цифрами и правильные ключевые слова.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {resumeExamples.map((ex) => (
          <Link
            key={ex.slug}
            href={`/resume-examples/${ex.slug}`}
            className="flex flex-col rounded-3xl border border-line bg-surface/60 p-6 transition-colors hover:border-white/20"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">{ex.level}</span>
              <span className="text-xs text-muted">{ex.role}</span>
            </div>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">{ex.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{ex.preview}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {ex.tags.map((t) => (
                <span key={t} className="rounded-full border border-line bg-white/5 px-2.5 py-1 text-[11px] text-muted">
                  {t}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-12 rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-surface/60 p-7">
        <h2 className="text-xl font-semibold tracking-tight">Готовое резюме под вашу вакансию</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Загрузите своё резюме в кабинет — EZOffer адаптирует формулировки под целевые вакансии и посчитает ATS-скор.
        </p>
        <Link
          href="/signup"
          className="mt-4 inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Улучшить резюме
        </Link>
      </div>
    </div>
  );
}