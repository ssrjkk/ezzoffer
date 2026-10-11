import Link from "next/link";
import { Section, SectionHead, PrimaryButton } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { securityCards } from "@/lib/data";

/*
 * «Никаких блокировок».
 *
 * Прежняя версия — три карточки с иконками в кружках и зелёным ободком,
 * поверх — полупрозрачная подложка, дающая «стеклянный» блок.
 *
 * Теперь — три колонки, разделённые вертикальными линейками, как
 * врезка-разворот в журнале. Иконка уехала в строку вместе с заголовком
 * и стала частью текста, а не отдельным объектом.
 */

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
    <Section>
      <SectionHead
        eyebrow="Никаких блокировок"
        title={
          <>
            Полная <span className="text-accent">безопасность</span> гарантирована
          </>
        }
        sub="Работаем по правилам job-платформ и повторяем поведение обычного соискателя — только быстрее, точнее и умнее"
      />

      <div className="grid border-t border-line md:grid-cols-3 md:divide-x md:divide-line">
        {securityCards.map((card, idx) => (
          <Reveal key={card.title} delay={idx * 80}>
            <div className="h-full border-b border-line py-8 md:px-8 md:py-10 md:first:pl-0">
              <svg viewBox="0 0 24 24" className="size-6 text-success" aria-hidden>
                {icons[card.icon]}
              </svg>
              <h3 className="mt-5 font-serif text-xl leading-snug">{card.title}</h3>
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted md:text-base">
                {card.text}
              </p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={100}>
        <div className="mt-12 flex flex-col items-start gap-4">
          <PrimaryButton href="/signup">Попробовать сейчас</PrimaryButton>
          {/*
            Раньше здесь стояло «Мы не храним доступы к твоему аккаунту».
            Формулировка фактически неверна: OAuth-токены hh.ru лежат в
            таблице users. Здесь — только то, что правда, без громкого
            обещания. Полный текст в platform-rules.
          */}
          <p className="max-w-prose text-sm leading-relaxed text-muted">
            Пароль от EZOffer хранится в виде хеша и не передаётся ни в hh.ru, ни в другие сервисы.
            Подробности — в{" "}
            <Link
              href="/platform-rules"
              className="border-b border-accent pb-0.5 text-accent transition-colors hover:border-ink hover:text-ink"
            >
              правилах платформ и безопасности
            </Link>
            .
          </p>
        </div>
      </Reveal>
    </Section>
  );
}