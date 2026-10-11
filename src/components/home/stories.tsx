import Link from "next/link";
import { Section, SectionHead, PrimaryButton } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { stories } from "@/lib/data";

/*
 * Истории успеха.
 *
 * Прежняя версия — три карточки с градиентной шапкой, «блеском»-линейкой
 * сверху и круглым аватаром из градиента. Ни то, ни другое ничего не
 * сообщало читателю.
 *
 * Теперь это врезки: имя и должность, цитата антиквой, результат акцентом.
 * Истории читаются как текст, а не как ячейки каталога.
 */

export function Stories() {
  return (
    <Section>
      <SectionHead
        eyebrow="Истории успеха"
        title={
          <>
            Работа мечты ближе вместе с <span className="text-accent">EZOffer</span>
          </>
        }
        sub="Реальные истории пользователей, которые получили оффер мечты вместе с нами"
      />

      <div className="grid gap-x-8 gap-y-10 border-t border-line pt-8 md:grid-cols-3">
        {stories.map((story, idx) => (
          <Reveal key={story.name} delay={idx * 80}>
            <article className="flex h-full flex-col">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="font-serif text-lg leading-snug">{story.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{story.role}</p>
                </div>
                <span className="font-mono text-xs tabular-nums text-warn" aria-label="5 из 5">
                  5.0
                </span>
              </div>

              <blockquote className="mt-4 flex-1 font-serif text-lg leading-snug text-ink">
                «{story.text}»
              </blockquote>

              <div className="mt-6 border-t border-line pt-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                  Результат
                </p>
                <p className="mt-1 text-base font-semibold text-accent">{story.result}</p>
                <p className="mt-2 font-mono text-xs text-muted">{story.company}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal delay={120}>
        <div className="mt-12 flex flex-col items-start gap-4">
          <PrimaryButton href="/signup">Попробовать бесплатно</PrimaryButton>
          <Link href="/reviews" className="text-sm text-accent underline underline-offset-4">
            Смотреть все отзывы
          </Link>
        </div>
      </Reveal>
    </Section>
  );
}