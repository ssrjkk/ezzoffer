import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/ui";
import { ReviewsList } from "@/components/reviews-list";
import { Figure } from "@/components/ui";

export const metadata: Metadata = {
  title: "Отзывы",
  description:
    "Отзывы пользователей EZOffer: истории поиска работы, офферы через 2 недели, сотни приглашений и экономия времени.",
};

/*
 * Отзывы.
 *
 * Прежние три показателя стояли в центре в трёх одинаковых стеклянных
 * коробках, а заголовок секции — над ними по центру: страница начиналась
 * с витрины и только потом переходила к отзывам, которые и есть её
 * содержание. Коробки были нужны, чтобы «повесить» на них три цифры.
 *
 * Теперь цифры стоят под линейкой рядом с текстом — тем же приёмом,
 * что Figure на тарифах, — и читаются как данные, а не как медали.
 */
export default function ReviewsPage() {
  return (
    <>
      <Section className="border-t-0 pt-16 md:pt-24">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <p className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
              <span aria-hidden className="block h-px w-7 bg-accent" />
              Отзывы клиентов
            </p>
            <h1 className="display mt-4 text-balance text-4xl md:text-6xl">
              Нам доверяют <span className="text-accent">сотни клиентов</span>
            </h1>
            <p className="measure mt-6 text-base leading-relaxed text-muted md:text-lg">
              Реальные истории тех, кто получил оффер вместе с EZOffer.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-6 self-end lg:col-span-5">
            <Figure value="4.9" label="средняя оценка" />
            <Figure value="1000+" label="офферов получено" />
            <Figure value="82%" label="оффер за 3–4 недели" />
          </div>
        </div>
      </Section>

      <Section className="pt-0">
        <ReviewsList />

        <div className="mt-14 border-t-2 border-ink pt-8">
          <h2 className="font-serif text-2xl md:text-3xl">Хотите так же?</h2>
          <p className="measure mt-3 leading-relaxed text-muted">
            Начните с бесплатного тестового периода на 24 часа — карта не нужна, отмена в один
            клик.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-6">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-sm bg-accent px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Попробовать бесплатно
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 border-b border-ink pb-0.5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
            >
              Сравнить тарифы
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}