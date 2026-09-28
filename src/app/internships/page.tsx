import type { Metadata } from "next";
import Link from "next/link";
import { internships } from "@/lib/data";

export const metadata: Metadata = {
  title: "Стажировки для студентов и junior",
  description:
    "Платные стажировки по разработке, аналитике и маркетингу. Наставник, реальные задачи и путь в штат.",
};

export default function InternshipsPage() {
  return (
    <div className="container-x py-12 md:py-16">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent-2">Инструменты</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">Стажировки</h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Платные стажировочные треки для студентов и junior-специалистов: реальные задачи продукта, наставник
          и путь в штат.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {internships.map((int) => (
          <article key={int.slug} className="flex flex-col rounded-3xl border border-line bg-surface/60 p-6">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">Стажировка</span>
              <span className="text-xs text-muted">{int.format}</span>
            </div>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">{int.title}</h2>
            <p className="mt-1 text-sm text-muted">
              {int.company} · {int.city}
            </p>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{int.description}</p>
            <p className="mt-3 text-base font-semibold text-success">{int.salary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {int.tags.map((t) => (
                <span key={t} className="rounded-full border border-line bg-white/5 px-2.5 py-1 text-[11px] text-muted">
                  {t}
                </span>
              ))}
            </div>
            <Link
              href="/signup"
              className="mt-4 inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Откликнуться
            </Link>
          </article>
        ))}
      </div>

      <div className="mt-12 rounded-3xl border border-line bg-surface/60 p-7">
        <h2 className="text-xl font-semibold tracking-tight">Как проходят стажировки EZOffer</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            ["1. Отбор", "Отклик и короткое собеседование с ментором по вашей специальности."],
            ["2. Работа", "Реальные задачи продукта с код-ревью и еженедельной обратной связью."],
            ["3. Рост", "Лучшие стажёры получают оффер в штат и рекомендацию."],
          ].map(([h, p]) => (
            <div key={h} className="rounded-2xl border border-line bg-white/[0.03] p-5">
              <h3 className="font-semibold">{h}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}