import Link from "next/link";
import { Section, SectionHead } from "@/components/ui";
import { ReviewsList } from "@/components/reviews-list";

/*
 * Превью отзывов на главной.
 *
 * Здесь была третья копия разметки отзывов (после /reviews и списка на
 * главной в другом виде) — со своими «градиентными кружками» и своей
 * разметкой звёзд. Три копии означают, что при смене палитры придётся
 * править три места, и однажды одно забудется — что и произошло.
 *
 * Теперь переиспользуется ReviewsList с limit.
 */

export function ReviewsPreview() {
  return (
    <Section>
      <SectionHead
        eyebrow="Отзывы клиентов"
        title={
          <>
            Нам доверяют <span className="text-accent">сотни клиентов</span>
          </>
        }
        sub="Средняя оценка 4.9 — вот что говорят те, кто уже получил оффер"
      />

      <ReviewsList limit={9} />

      <div className="mt-10 flex flex-col items-start gap-4">
        <Link
          href="/reviews"
          className="inline-flex items-center gap-2 border-b border-ink pb-0.5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Смотреть все отзывы
          <span aria-hidden>→</span>
        </Link>
        <Link href="/#tariff" className="text-sm text-muted transition-colors hover:text-accent">
          Перейти к тарифам
        </Link>
      </div>
    </Section>
  );
}