import Link from "next/link";
import { Section } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { jobs } from "@/lib/data";

export function LevelPill({ level }: { level: string }) {
  const styles: Record<string, string> = {
    Intern: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
    Junior: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
    Middle: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    Senior: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${styles[level] ?? styles.Junior}`}>
      {level}
    </span>
  );
}

export function JobsPreview() {
  const preview = jobs.slice(0, 6);

  return (
    <Section className="relative">
      <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">
            Вакансии со всего рынка
          </p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-balance md:text-5xl">
            Тысячи вакансий — <span className="text-gradient">в одном месте</span>
          </h2>
        </div>
        <Link
          href="/jobs"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-ink"
        >
          Смотреть все вакансии
          <span aria-hidden>→</span>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {preview.map((job, idx) => (
          <Reveal key={job.slug} delay={(idx % 3) * 70}>
            <Link
              href={`/jobs/${job.slug}`}
              className="group flex h-full flex-col rounded-3xl border border-line bg-surface/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/40"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-accent/25 to-accent-2/20 text-sm font-bold ring-1 ring-white/10">
                  {job.company.slice(0, 2)}
                </span>
                <LevelPill level={job.level} />
              </div>
              <p className="mt-4 text-base font-semibold leading-snug group-hover:text-gradient">
                {job.title}
              </p>
              <p className="mt-1.5 text-sm text-muted">{job.company}</p>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                <span className="text-sm font-semibold text-success">{job.salary}</span>
                <span className="text-sm text-muted">·</span>
                <span className="text-sm text-muted">{job.format}</span>
                <span className="text-sm text-muted">·</span>
                <span className="text-sm text-muted">{job.city}</span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                <span className="text-xs text-muted">{job.category}</span>
                <span className="inline-flex items-center gap-1 text-xs text-accent-2">
                  {job.posted}
                  <span className="inline-flex size-1.5 rounded-full bg-success animate-pulse-dot" />
                </span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}