import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-x grid py-24 md:py-32">
      <div className="mx-auto max-w-lg text-center">
        <p className="text-7xl font-semibold text-gradient md:text-9xl">404</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">
          Куда-то не туда
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted md:text-base">
          Такой страницы нет. Зато можно вернуться на главную и начать поиск оффера мечты.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-accent px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_36px_-8px_rgba(124,92,255,0.8)] transition hover:brightness-110"
          >
            На главную
          </Link>
          <Link
            href="/jobs"
            className="inline-flex items-center justify-center rounded-full border border-line bg-white/5 px-7 py-3.5 text-sm font-semibold text-ink transition hover:bg-white/10"
          >
            Смотреть вакансии
          </Link>
        </div>
      </div>
    </div>
  );
}