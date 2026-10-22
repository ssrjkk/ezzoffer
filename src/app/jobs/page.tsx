import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { Section, SectionHead, PrimaryButton } from '@/components/ui';
import { JobsGrid } from '@/components/jobs-grid';

export const metadata: Metadata = pageMeta('/jobs', {
  title: 'Вакансии',
  description:
    'Примеры вакансий из каталога EZOffer: разработка, дизайн, продукт, аналитика, маркетинг. Живой каталог — в кабинете после регистрации.',
});

export default function JobsPage() {
  return (
    <>
      <Section className="pb-8 pt-16 md:pt-24">
        <SectionHead
          eyebrow="Вакансии · демо-подборка"
          level="h1"
          title={
            <>
              Как выглядят вакансии <span className="text-accent">в каталоге</span>
            </>
          }
          sub="Ниже — примеры для показа. Живой каталог (hh.ru, Работа России, Работа.ру и ещё десять источников) собирается под ваш запрос в кабинете — после регистрации."
        />
      </Section>

      {/*
        scroll-mt — под липкую шапку (h-14 на телефоне, h-16 от md).
        Без него переход по якорю #jobs-list приводил первую вакансию под
        непрозрачную шапку: она оказывалась ровно на той высоте, где её
        закрывал sticky-хедер.
      */}
      <Section id="jobs-list" className="scroll-mt-14 pt-0 md:scroll-mt-16">
        <JobsGrid />

        <div className="mt-14 border-t-2 border-ink pt-10">
          <h2 className="font-serif text-2xl md:text-3xl">Не нашли свою вакансию?</h2>
          <p className="measure mt-3 leading-relaxed text-muted">
            Мы подберём вакансии под ваше резюме, опыт и зарплатные ожидания — и начнём откликаться
            уже сегодня.
          </p>
          <div className="mt-7">
            <PrimaryButton href="/signup">Подобрать вакансии под меня</PrimaryButton>
          </div>
        </div>
      </Section>
    </>
  );
}
