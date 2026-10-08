import type { Metadata } from "next";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { Security } from "@/components/home/security";
import { Stories } from "@/components/home/stories";
import { Advantages } from "@/components/home/advantages";
import { ResumeSlider } from "@/components/home/resume-slider";
import { TelegramBot } from "@/components/home/telegram-bot";
import { PricingSection } from "@/components/home/pricing";
import { ReviewsPreview } from "@/components/home/reviews-preview";
import { FaqAccordion } from "@/components/home/faq";
import { Team } from "@/components/home/team";
import { JobsPreview } from "@/components/home/jobs-preview";
import { BlogPreview } from "@/components/home/blog-preview";
import { CtaBanner } from "@/components/home/cta";
import { JsonLd } from "@/components/json-ld";
import { envBaseUrl } from "@/lib/env";

export const metadata: Metadata = {
  title: "Поиск работы без стресса и отказов",
  description:
    "AI-агент для поиска работы: улучшает резюме, подбирает вакансии и отправляет до 100 персональных откликов в день.",
};

const siteUrl = envBaseUrl(process.env, "SITE_URL", "https://ezoffer.ru");

export default function Home() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "EZOffer",
          url: siteUrl,
          description:
            "AI-агент для поиска работы: усиливает резюме, подбирает вакансии и отправляет персональные отклики.",
          logo: `${siteUrl}/icon.svg`,
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "EZOffer",
          url: siteUrl,
        }}
      />
      <Hero />
      <HowItWorks />
      <Security />
      <Stories />
      <Advantages />
      <ResumeSlider />
      <TelegramBot />
      <PricingSection />
      <ReviewsPreview />
      <FaqAccordion />
      <Team />
      <JobsPreview />
      <BlogPreview />
      <CtaBanner />
    </>
  );
}