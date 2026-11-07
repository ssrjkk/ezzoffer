// Куда ведут CTA публичной витрины.
//
// Полное приложение (кабинет, регистрация) живёт на сервере и на GitHub Pages
// не работает: /signup и /login там отдают 404 (см. .github/workflows/pages.yml).
// Если сборка витрины знает рабочий канал онбординга — ведём все CTA туда.
// В серверной сборке переменная не задана, ссылки остаются внутренними.
export function ctaUrl(path: "/signup" | "/login"): string {
  const external = process.env.NEXT_PUBLIC_ONBOARDING_URL;
  if (external) return external;
  return path;
}
