import { Section } from '@/components/ui';

// Заглушка на время загрузки публичной страницы.
//
// Раньше route без loading.tsx показывал… ничего: Next ждал серверный
// компонент и держал предыдущий экран. Тишина после клика читается как
// поломка, поэтому здесь честный скелетон в стиле сайта.
export default function Loading() {
  return (
    <Section>
      <div className="max-w-2xl" aria-hidden>
        <p className="h-3 w-40 rounded-sm bg-line" />
        <p className="mt-6 h-10 w-3/4 rounded-sm bg-line" />
        <p className="mt-4 h-4 w-full rounded-sm bg-line" />
        <p className="mt-2 h-4 w-5/6 rounded-sm bg-line" />
      </div>
      <p className="sr-only" role="status">
        Страница загружается…
      </p>
    </Section>
  );
}
