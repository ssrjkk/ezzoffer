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
              Тысячи вакансий — <span className="text-gradient">в одном месте</span>
            </>
          }
          sub="Откликаемся на них за вас автоматически: персональное письмо, релевантные фильтры и скорость первым среди соискателей"
        />
      </Section>

      <Section id="jobs-list" className="pt-0">
        <JobsGrid />

        <div className="mt-14 rounded-3xl border border-line bg-gradient-to-r from-accent/15 to-accent-2/10 p-8 text-center md:p-12">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Не нашли свою вакансию?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted md:text-base">
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