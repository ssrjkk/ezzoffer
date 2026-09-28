import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { jobs } from "@/lib/data";
import { LevelPill } from "@/components/home/jobs-preview";
import { JsonLd } from "@/components/json-ld";

const siteUrl = process.env.SITE_URL ?? "https://ezoffer.ru";

// SSG: дата фиксируется на момент сборки — корректно для статических страниц.
const nowIso = new Date().toISOString();
const validIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

function salaryRange(text: string) {
  const match = text.match(/от\s*([\d\s]+)/);
  return match ? parseInt(match[1].replace(/\s/g, ""), 10) : null;
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-ink/90 md:text-base">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-2" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function generateStaticParams() {
  return jobs.map((job) => ({ slug: job.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const job = jobs.find((j) => j.slug === slug);
  if (!job) return { title: "Вакансия не найдена" };
  return {
    title: job.title,
    description: `${job.title} — ${job.company}, ${job.salary}, ${job.format}. Откликнемся за вас в EZOffer.`,
  };
}

export default async function JobPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const job = jobs.find((j) => j.slug === slug);
  if (!job) notFound();

  const related = jobs.filter((j) => j.category === job.category && j.slug !== job.slug).slice(0, 3);
  const minSalary = salaryRange(job.salary);

  return (
    <div className="container-x py-12 md:py-16">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: job.title,
          url: `${siteUrl}/jobs/${job.slug}`,
          description: `${job.about}\n\n${job.responsibilities.join("\n")}`,
          datePosted: nowIso,
          validThrough: validIso,
          employmentType: "FULL_TIME",
          hiringOrganization: { "@type": "Organization", name: job.company },
          jobLocation: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressLocality: job.city, addressCountry: "RU" },
          },
          ...(minSalary
            ? {
                baseSalary: {
                  "@type": "MonetaryAmount",
                  currency: "RUB",
                  value: { "@type": "QuantitativeValue", minValue: minSalary, unitText: "MONTH" },
                },
              }
            : {}),
        }}
      />
      <Link
        href="/jobs"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <span aria-hidden>←</span> Все вакансии
      </Link>

      <header className="mt-6 rounded-3xl border border-line bg-surface/60 p-7 md:p-10">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-accent/25 to-accent-2/20 text-base font-bold ring-1 ring-white/10">
            {job.company.slice(0, 2)}
          </span>
          <LevelPill level={job.level} />
          <span className="text-xs text-muted">{job.category}</span>
        </div>
        <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          {job.title}
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm md:text-base">
          <span className="font-semibold text-success">{job.salary}</span>
          <span className="text-muted">{job.format}</span>
          <span className="text-muted">{job.city}</span>
          <span className="inline-flex items-center gap-1.5 text-muted">
            <span className="inline-flex size-1.5 rounded-full bg-success animate-pulse-dot" />
            {job.posted}
          </span>
        </div>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-accent px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_36px_-8px_rgba(124,92,255,0.8)] transition hover:brightness-110"
          >
            Откликнуться через EZOffer
          </Link>
          <span className="inline-flex items-center justify-center rounded-full border border-line bg-white/5 px-5 py-3.5 text-sm text-muted">
            Автоотклик займёт 0 секунд вашего времени
          </span>
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-8">
          <section className="rounded-3xl border border-line bg-surface/60 p-7">
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl">О компании и позиции</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted md:text-base">{job.about}</p>
          </section>

          <section className="rounded-3xl border border-line bg-surface/60 p-7">
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Чем предстоит заниматься</h2>
            <List items={job.responsibilities} />
          </section>

          <section className="rounded-3xl border border-line bg-surface/60 p-7">
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Что мы ждём</h2>
            <List items={job.requirements} />
          </section>

          <section className="rounded-3xl border border-line bg-surface/60 p-7">
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Будет плюсом</h2>
            <List items={job.bonus} />
          </section>
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-accent/40 bg-gradient-to-b from-accent/15 to-surface/60 p-7">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent-2">
              А вы знали?
            </p>
            <h3 className="mt-3 text-xl font-semibold leading-snug tracking-tight">
              На эту вакансию уже откликнулись другие
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Отклики в первые часы после публикации получают в 3–5 раз больше просмотров. EZOffer
              отправляет отклик в первые минуты появления вакансии.
            </p>
            <Link
              href="/signup"
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Откликнуться первым
            </Link>
          </div>

          {related.length > 0 ? (
            <div>
              <h3 className="mb-4 text-lg font-semibold tracking-tight">Похожие вакансии</h3>
              <div className="space-y-3">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/jobs/${r.slug}`}
                    className="block rounded-2xl border border-line bg-surface/60 p-5 transition-colors hover:border-white/20"
                  >
                    <p className="text-sm font-semibold">{r.title}</p>
                    <p className="mt-1 text-xs text-muted">{r.salary} · {r.format}</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}