import type { Metadata } from "next";
import { Section, SectionHead, PrimaryButton } from "@/components/ui";
import { FaqAccordion } from "@/components/home/faq";

export const metadata: Metadata = {
  title: "Вопросы и ответы",
  description: "FAQ EZOffer: безопасность, автоотклики, резюме, сопроводительные письма, тарифы и пробный период.",
};

export default function FaqPage() {
  return (
    <>
      <Section className="pb-0 pt-16 md:pt-24">
        <SectionHead
          eyebrow="FAQ"
          title={
            <>
              Вопросы и <span className="text-gradient">ответы</span>
            </>
          }
          sub="Не нашли ответ — напишите в поддержку, отвечаем в течение часа в рабочее время"
        />
      </Section>
      <FaqAccordion />

      <Section className="border-t border-line bg-surface/40">
        <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-gradient-to-br from-accent/15 to-accent-2/10 p-10 text-center md:p-14">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Остались вопросы?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Начните с бесплатного периода — половина вопросов исчезает после первого дня работы
            сервиса. Остальное расскажет поддержка.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryButton href="/signup">Попробовать бесплатно</PrimaryButton>
          </div>
        </div>
      </Section>
    </>
  );
}