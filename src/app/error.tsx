'use client';

// Граница ошибок вместо стандартной страницы Next.
//
// Без неё любая ошибка рендера показывала стоковый экран фреймворка —
// чужой стиль посреди сайта. Здесь та же бумага и линейки, плюс кнопка
// «попробовать ещё раз» вместо мёртвого экрана.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container-x py-14 md:py-20">
      <div className="max-w-2xl border-t-2 border-ink pt-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-danger">
          Что-то пошло не так
        </p>
        <h1 className="mt-4 font-serif text-3xl text-balance md:text-4xl">
          Страница не смогла загрузиться
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Обычно помогает обновление. Если ошибка повторяется — напишите нам, что вы делали перед
          этим: починим.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-muted">Код ошибки: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-sm bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          Попробовать ещё раз
        </button>
      </div>
    </div>
  );
}
