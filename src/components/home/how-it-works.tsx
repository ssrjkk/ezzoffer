import { Section, SectionHead, PrimaryButton } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { steps } from "@/lib/data";

const icons: Record<string, React.ReactNode> = {
  link: (
    <path
      d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      stroke="currentColor"
      fill="none"
    />
  ),
  sparkles: (
    <path
      d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Zm7 10l.9 2.1L22 16l-2.1.9L19 19l-.9-2.1L16 16l2.1-.9L19 13ZM6 15l.9 2.1L9 18l-2.1.9L6 21l-.9-2.1L3 18l2.1-.9L6 15Z"
      fill="currentColor"
    />
  ),
  send: (
    <path
      d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      stroke="currentColor"
      fill="none"
    />
  ),
  bell: (
    <path
      d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      stroke="currentColor"
      fill="none"
    />
  ),
};

export function HowItWorks() {
  return (
    <Section id="how-it-work" className="relative">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-96 w-[700px] -translate-x-1/2 rounded-full bg-accent/10 blur-[130px]" />

      <SectionHead
        eyebrow="Как это работает"
        title={
          <>
            Меньше усилий — <span className="text-gradient">больше приглашений</span>
          </>
        }
        sub="Берём поиск работы на себя и экономим вам до 27 часов в неделю"
      />

      <div className="relative grid gap-5 md:grid-cols-2">
        {steps.map((step, idx) => (
          <Reveal key={step.title} delay={idx * 90}>
            <article className="group relative flex h-full flex-col gap-4 overflow-hidden rounded-3xl border border-line bg-surface/70 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 md:p-8">
              <div className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-accent/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-accent/25 to-accent-2/20 text-ink ring-1 ring-white/10">
                  <svg viewBox="0 0 24 24" className="size-5.5">
                    {icons[step.icon]}
                  </svg>
                </span>
                <span className="text-5xl font-semibold text-white/5 tabular-nums">
                  {String(idx + 1).padStart(2, "0")}
                </span>
              </div>
              <div>
                <h3 className="text-xl font-semibold tracking-tight md:text-2xl">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted md:text-base">{step.text}</p>
              </div>
              <span className="mt-auto inline-flex w-fit rounded-full bg-accent/15 px-3.5 py-1.5 text-xs font-semibold text-accent-2 ring-1 ring-accent/30">
                {step.badge}
              </span>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal delay={120}>
        <div className="mt-12 text-center">
          <PrimaryButton href="/signup">Начать бесплатно</PrimaryButton>
        </div>
      </Reveal>
    </Section>
  );
}
