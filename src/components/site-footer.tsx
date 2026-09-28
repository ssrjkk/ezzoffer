import Link from "next/link";
import { Logo } from "./site-header";

const columns = [
  {
    title: "Инструменты",
    links: [
      { href: "/#resume", label: "Улучшение резюме с AI" },
      { href: "/jobs", label: "Вакансии" },
      { href: "/resume-examples", label: "Примеры резюме" },
      { href: "/internships", label: "Стажировки" },
      { href: "/pricing", label: "Автоотклики" },
    ],
  },
  {
    title: "О сервисе",
    links: [
      { href: "/about", label: "О нас" },
      { href: "/reviews", label: "Отзывы" },
      { href: "/blog", label: "Новости и статьи" },
      { href: "/faq", label: "Вопросы и ответы" },
    ],
  },
  {
    title: "Поддержка",
    links: [
      { href: "/faq", label: "База знаний" },
      { href: "/platform-rules", label: "Правила платформ и безопасность" },
      { href: "/about", label: "Консультации" },
      { href: "/pricing", label: "Тарифы" },
      { href: "/signup", label: "Начать бесплатно" },
    ],
  },
  {
    title: "Медиа",
    links: [
      { href: "/blog", label: "Блог о поиске работы" },
      { href: "/reviews", label: "Истории успеха" },
      { href: "/jobs", label: "Свежие вакансии" },
      { href: "/faq", label: "Безопасность" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface/60">
      <div className="container-x py-14 md:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              AI-агент для поиска работы: резюме, вакансии и отклики без рутины.
              Пробный период 24 часа без привязки карты.
            </p>
            <div className="mt-5 flex items-center gap-2 text-sm text-muted">
              <span className="inline-flex size-2 rounded-full bg-success animate-pulse-dot" />
              Сервис работает штатно
            </div>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-ink">
                {col.title}
              </p>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 text-sm text-muted md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} EZOffer. Все права защищены.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/faq" className="transition-colors hover:text-ink">
              Условия сервиса
            </Link>
            <Link href="/faq" className="transition-colors hover:text-ink">
              Политика конфиденциальности
            </Link>
            <Link href="/about" className="transition-colors hover:text-ink">
              Контакты
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
