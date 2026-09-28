import Link from "next/link";
import { Section, SectionHead, PrimaryButton } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { stories } from "@/lib/data";

export function Stories() {
  return (
    <Section>
      <SectionHead
        eyebrow="Истории успеха"
        title={
          <>
            Работа мечты ближе вместе с <span className="text-gradient">EZOffer</span>
          </>
        }
        sub="Реальные истории пользователей, которые получили оффер мечты вместе с нами"
      />

      <div className="grid gap-5 md:grid-cols-3">
        {stories.map((story, idx) => (
          <Reveal key={story.name} delay={idx * 90}>
            <article className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-surface-2/80 to-surface/40 p-7 transition-all hover:-translate-y-1 hover:border-accent/40">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-white">
                    {story.initials}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{story.name}</p>
                    <p className="text-xs text-muted">{story.role}</p>
                  </div>
                </div>
                <span className="text-warn" aria-label="5 из 5">
                  ★★★★★
                </span>
              </div>

              <blockquote className="mt-5 flex-1 text-sm leading-relaxed text-muted md:text-[15px]">
                «{story.text}»
              </blockquote>

              <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4">
                <div>
                  <p className="text-xs text-muted">Результат</p>
                  <p className="text-sm font-semibold text-gradient">{story.result}</p>
                </div>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-muted">
                  {story.company}
                </span>
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal delay={120}>
        <div className="mt-12 flex flex-col items-center gap-4">
          <PrimaryButton href="/signup">Попробовать бесплатно</PrimaryButton>
          <Link href="/reviews" className="text-sm text-muted transition-colors hover:text-ink">
            Смотреть все отзывы →
          </Link>
        </div>
      </Reveal>
    </Section>
  );
}
