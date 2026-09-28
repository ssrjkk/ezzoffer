import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { resumeExamples } from "@/lib/data";

export function generateStaticParams() {
  return resumeExamples.map((ex) => ({ slug: ex.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ex = resumeExamples.find((e) => e.slug === slug);
  if (!ex) return { title: "Пример не найден" };
  return { title: ex.title, description: ex.preview };
}

export default async function ResumeExamplePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ex = resumeExamples.find((e) => e.slug === slug);
  if (!ex) notFound();

  return (
    <div className="container-x py-12 md:py-16">
      <Link href="/resume-examples" className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink">
        <span aria-hidden>←</span> Все примеры резюме
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">{ex.level}</span>
        <span className="text-sm text-muted">{ex.role}</span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">{ex.title}</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">{ex.preview}</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-3xl border border-line bg-surface/60 p-7">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Шаблон резюме</p>
          <div className="mt-5 space-y-6">
            {ex.sections.map((s) => (
              <section key={s.h}>
                <h2 className="border-b border-line pb-1 text-sm font-semibold uppercase tracking-wide">{s.h}</h2>
                <ul className="mt-3 space-y-2">
                  {s.lines.map((l, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-accent-2" />
                      {l}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-line bg-surface/60 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Ключевые слова</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ex.tags.map((t) => (
                <span key={t} className="rounded-full border border-line bg-white/5 px-2.5 py-1 text-[11px] text-muted">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-surface/60 p-6">
            <h2 className="text-lg font-semibold tracking-tight">Хотите так же?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Вставьте этот шаблон в кабинет EZOffer, и AI-улучшение доработает формулировки под ваши вакансии.
            </p>
            <Link
              href="/signup"
              className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Начать бесплатно
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}