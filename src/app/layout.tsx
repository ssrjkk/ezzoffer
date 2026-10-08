import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { envBaseUrl } from "@/lib/env";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

const siteUrl = envBaseUrl(process.env, "SITE_URL", "https://ezoffer.ru");

export const metadata: Metadata = {
  // envBaseUrl, а не `process.env.SITE_URL ?? ...`: пустое значение из
  // .env.example доходило до new URL("") и роняло сборку на Invalid URL.
  metadataBase: new URL(siteUrl),
  title: {
    default: "EZOffer — поиск работы без стресса и отказов",
    template: "%s | EZOffer",
  },
  description:
    "AI-агент для поиска работы: усиливает резюме, подбирает вакансии и отправляет до 100 персональных откликов в день. 24 часа бесплатно без карты.",
  keywords: [
    "автоотклики",
    "поиск работы",
    "hh.ru",
    "резюме AI",
    "сопроводительные письма",
    "вакансии",
  ],
  openGraph: {
    title: "EZOffer — поиск работы без стресса и отказов",
    description:
      "Подберём вакансии, улучшим резюме с AI и отправим отклики за вас. Пробный период 24 часа без карты.",
    locale: "ru_RU",
    type: "website",
    url: siteUrl,
    siteName: "EZOffer",
  },
  twitter: {
    card: "summary",
    title: "EZOffer — поиск работы без стресса и отказов",
    description: "Подберём вакансии, улучшим резюме с AI и отправим отклики за вас.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      data-scroll-behavior="smooth"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg font-sans text-ink">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
