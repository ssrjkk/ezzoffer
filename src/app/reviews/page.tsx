import type { Metadata } from "next";
import { Section, SectionHead, PrimaryButton } from "@/components/ui";
import { ReviewsList } from "@/components/reviews-list";

export const metadata: Metadata = {
  title: "Отзывы",
  description: "Отзывы пользователей EZOffer: истории поиска работы, офферы через 2 недели, сотни приглашений и экономия времени.",
};

export default function ReviewsPage() {
  return (
    <>
      <Section className="pb-8 pt-16 md:pt-24">
        <SectionHead
          eyebrow="Отзывы клиентов"
          title={
            <>
              Нам доверяют <span className="text-gradient">сотни клиентов</span>
            </>
          }
          sub="Средняя оценка 4.9. Реальные истории тех, кто получил оффер вместе с EZOffer"
        />
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-4">
          <div className="glass flex items-center gap-3 rounded-2xl px-5 py-4">
            <span className="text-4xl font-semibold text-gradient">4.9</span>
            <div>
              <p className="text-sm text-warn">★★★★★</p>
              <p className="text-xs text-muted">средняя оценка</p>
            </div>
          </div>
          <div className="glass rounded-2xl px-5 py-4 text-center">
            <p className="text-2xl font-semibold">1000+</p>
            <p className="text-xs text-muted">офферов получено</p>
          </div>
          <div className="glass rounded-2xl px-5 py-4 text-center">
            <p className="text-2xl font-semibold">82%</p>
            <p className="text-xs text-muted">оффер за 3–4 недели</p>
          </div>
        </div>
      </Section>

      <Section className="pt-0">
        <ReviewsList />

        <div className="mt-14 flex flex-col items-center gap-4 text-center">
          <p className="max-w-md text-sm text-muted">
            Хотите так же? Начните с бесплатного тестового периода на 24 часа.
          </p>
          <PrimaryButton href="/signup">Попробовать бесплатно</PrimaryButton>
        </div>
      </Section>
    </>
  );
}