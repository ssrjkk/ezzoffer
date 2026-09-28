import { Section, SectionHead, PrimaryButton } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { securityCards } from "@/lib/data";

const icons: Record<string, React.ReactNode> = {
  pulse: (
    <path
      d="M3 12h4l2-7 4 14 2-7h6"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      stroke="currentColor"
      fill="none"
    />
  ),
  shield: (
    <path
      d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Zm-3 9 2 2 4-4"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      stroke="currentColor"
      fill="none"
    />
  ),
  check: (
    <path
      d="M9 12.5 11 14.5 15.5 10M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      stroke="currentColor"
      fill="none"
    />
  ),
};

export function Security() {
  return (
    <Section className="relative border-y border-line bg-surface/40">
      <SectionHead
        eyebrow="Никаких блокировок"
        title={
          <>
            Полная <span className="text-gradient">безопасность</span> гарантирована
          </>
        }
        sub="Работаем по правилам job-платформ и повторяем поведение обычного соискателя — только быстрее, точнее и умнее"
      />

      <div className="grid gap-5 md:grid-cols-3">
        {securityCards.map((card, idx) => (
          <Reveal key={card.title} delay={idx * 90}>
            <div className="group h-full rounded-3xl border border-line bg-bg/60 p-7 transition-colors hover:border-success/40">
              <span className="grid size-12 place-items-center rounded-2xl bg-success/10 text-success ring-1 ring-success/25 transition-transform duration-300 group-hover:scale-110">
                <svg viewBox="0 0 24 24" className="size-5.5">
                  {icons[card.icon]}
                </svg>
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight md:text-xl">{card.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted md:text-base">{card.text}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={100}>
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <PrimaryButton href="/signup">Попробовать сейчас</PrimaryButton>
          <p className="text-xs text-muted">Мы не запрашиваем пароль и не храним доступы к аккаунту</p>
        </div>
      </Reveal>
    </Section>
  );
}
