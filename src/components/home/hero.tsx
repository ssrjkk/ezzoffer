import { Badge, GradientText, PrimaryButton, GhostButton } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { jobs, stats } from "@/lib/data";

const topRow = jobs.slice(0, 5);
const bottomRow = jobs.slice(5, 10);

function VacancyChip({ job }: { job: (typeof jobs)[number] }) {
  return (
    <div className="flex min-w-[260px] items-center gap-3 rounded-2xl border border-line bg-surface-2/80 px-4 py-3 shadow-lg shadow-black/20">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent/30 to-accent-2/30 text-sm font-bold text-ink">
        {job.company.slice(0, 2)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{job.title}</p>
        <p className="truncate text-xs text-muted">
          {job.company} · {job.salary} · {job.format}
        </p>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
      <div className="pointer-events-none absolute inset-0 bg-grid mask-fade-y opacity-70" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-accent/25 blur-[140px]" />
      <div className="pointer-events-none absolute top-40 -right-24 h-72 w-72 rounded-full bg-accent-2/20 blur-[100px]" />
      <div className="pointer-events-none absolute top-64 -left-20 h-64 w-64 rounded-full bg-pink-500/15 blur-[100px]" />

      <div className="container-x relative">
        <div className="mx-auto max-w-4xl text-center">
          <Reveal>
            <Badge>AI-агент для поиска работы · новый уровень</Badge>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-balance md:text-7xl">
              Поиск работы <GradientText>без стресса</GradientText> и отказов
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted md:text-xl">
              Улучшим резюме с AI, подберём релевантные вакансии и отправим до 100
              персональных откликов в день. Вам останется выбирать лучшие приглашения.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <PrimaryButton href="/signup">Попробовать бесплатно</PrimaryButton>
              <GhostButton href="/#how-it-work">Как это работает</GhostButton>
            </div>
            <p className="mt-4 text-xs text-muted">
              24 часа бесплатно · без привязки карты · отмена в один клик
            </p>
          </Reveal>

          <Reveal delay={320}>
            <div className="mt-10 inline-flex items-center gap-4 rounded-2xl border border-line bg-surface/70 px-5 py-3.5">
              <div className="flex -space-x-2.5" aria-hidden>
                {["А", "М", "Р", "Е", "Д"].map((i, idx) => (
                  <span
                    key={i}
                    className={`grid size-8 place-items-center rounded-full border-2 border-bg text-[11px] font-bold text-white ${
                      [
                        "bg-violet-500",
                        "bg-cyan-500",
                        "bg-pink-500",
                        "bg-emerald-500",
                        "bg-amber-500",
                      ][idx]
                    }`}
                  >
                    {i}
                  </span>
                ))}
              </div>
              <div className="text-left">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <span className="text-warn">★</span> 4.9
                  <span className="font-normal text-muted">· 1000+ офферов</span>
                </p>
                <p className="text-xs text-muted">получено нашими пользователями</p>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={200} className="mt-16">
          <div className="space-y-3 overflow-hidden">
            <div className="mask-fade-x flex w-max gap-3 animate-marquee hover:[animation-play-state:paused]">
              {[...topRow, ...topRow].map((job, idx) => (
                <VacancyChip key={`${job.slug}-${idx}`} job={job} />
              ))}
            </div>
            <div className="mask-fade-x flex w-max gap-3 animate-marquee-reverse hover:[animation-play-state:paused]">
              {[...bottomRow, ...bottomRow].map((job, idx) => (
                <VacancyChip key={`${job.slug}-${idx}`} job={job} />
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <dl className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="glass rounded-2xl px-5 py-6 text-center transition-colors hover:border-white/20"
              >
                <dt className="text-3xl font-semibold tracking-tight text-gradient md:text-4xl">
                  {stat.value}
                </dt>
                <dd className="mt-2 text-xs leading-snug text-muted md:text-sm">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
