import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Правила платформ и безопасность аккаунта",
  description:
    "Как EZOffer работает в рамках правил hh.ru и других платформ, что делать для снижения рисков и как мгновенно поставить автоотклики на паузу.",
};

const rules = [
  {
    h: "Отклики отправляются от вашего имени",
    p: "EZOffer использует официальные механизмы платформы (API/учётную запись пользователя). Работодатель видит обычный отклик — без пометки «автоматический».",
  },
  {
    h: "Мы не обходим защиту платформ",
    p: "Сервис не взламывает, не имитирует поддельные действия и не использует недокументированные интерфейсы. Все отклики — реальные, через вашу учётную запись.",
  },
  {
    h: "Риск блокировки существует",
    p: "Массовые автоматические отклики могут противоречить правилам платформы. Мы встраиваем умеренные лимиты и паузы, но не можем гарантировать отсутствие блокировки. Используйте сервис ответственно.",
  },
  {
    h: "Мгновенная пауза",
    p: "В любой момент вы можете остановить автоотклики одной кнопкой в кабинете. Все активные поиски переводятся в статус «Пауза» без удаления настроек.",
  },
];

export default function PlatformRulesPage() {
  return (
    <div className="container-x py-12 md:py-16">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent-2">Безопасность</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          Правила платформ и безопасность аккаунта
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Честная позиция EZOffer: мы автоматизируем рутину в рамках официальных механизмов, но вы обязаны понимать
          правила платформы, на которой ищете работу.
        </p>
      </div>

      <div className="mt-10 space-y-4">
        {rules.map((r) => (
          <section key={r.h} className="rounded-3xl border border-line bg-surface/60 p-7">
            <h2 className="text-xl font-semibold tracking-tight">{r.h}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted md:text-base">{r.p}</p>
          </section>
        ))}
      </div>

      <div className="mt-12 rounded-3xl border border-warn/30 bg-warn/10 p-7">
        <h2 className="text-xl font-semibold tracking-tight">Важно понимать</h2>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted">
          <li>• Не гонитесь за потолком лимитов — умеренный темп безопаснее.</li>
          <li>• Откликайтесь на релевантные вакансии, а не «во всё подряд».</li>
          <li>• Поддерживайте живую активность профиля: отвечайте в чатах, обновляйте резюме.</li>
          <li>• При любом предупреждении платформы немедленно ставьте автоотклики на паузу.</li>
        </ul>
      </div>

      <div className="mt-8">
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Перейти в кабинет
        </Link>
      </div>
    </div>
  );
}