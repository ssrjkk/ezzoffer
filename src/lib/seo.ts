import type { Metadata } from 'next';

/**
 * Метаданные публичной страницы: canonical + честный og:url.
 *
 * Без canonical поисковики видят дубли (со слэшем/без, с query-хвостами от
 * рекламных переходов). Без og:url на каждой странице все репосты в соцсетях
 * несли root-URL главной — шеринг статьи вёл на главную вместо статьи.
 */
export function pageMeta(path: string, meta: Metadata): Metadata {
  return {
    ...meta,
    alternates: { canonical: path },
    openGraph: { ...(meta.openGraph ?? {}), url: path },
  };
}
