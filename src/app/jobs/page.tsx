import type { Metadata } from "next";
import { Section, SectionHead, PrimaryButton } from "@/components/ui";
import { JobsGrid } from "@/components/jobs-grid";

export const metadata: Metadata = {
  title: "Вакансии",
  description: "Тысячи вакансий со всего рынка в одном месте: разработка, дизайн, продукт, аналитика, маркетинг и стажировки.",
};

export default function JobsPage() {
  return (
    <>
      <Section className="pb-8 pt-16 md:pt-24">
        <SectionHead
          eyebrow="Вакансии"
          title={
            <>
              Тысячи вакансий — <span className="text-accent">в одном месте</span>
            </>
          }
          sub="Откликаемся на них за вас автоматически: персональное письмо, релевантные фильтры и скорость первым среди соискателей"
        />
      </Section>

      <Section id="jobs-list" className="pt-0">
        <JobsGrid />

        <div className="mt-14 border-t-2 border-ink pt-10">
          <h2 className="font-serif text-2xl md:text-3xl">Не нашли свою вакансию?</h2>
          <p className="measure mt-3 leading-relaxed text-muted">
            Мы подберём вакансии под ваше резюме, опыт и зарплатные ожидания — и начнём
            откликаться уже сегодня.
          </p>
          <div className="mt-7">
            <PrimaryButton href="/signup">Подобрать вакансии под меня</PrimaryButton>
          </div>
        </div>
      </Section>
    </>
  );
}