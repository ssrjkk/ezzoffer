import { Panel } from '@/components/dashboard/ui';

// Скелетон кабинета: серверный компонент грузит данные, и без loading
// страница висела пустой. Шесть полосок — по числу будущих карточек.
export default function Loading() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <Panel key={i}>
          <p className="h-5 w-1/3 rounded-sm bg-line" />
          <p className="mt-3 h-4 w-full rounded-sm bg-line" />
          <p className="mt-2 h-4 w-2/3 rounded-sm bg-line" />
        </Panel>
      ))}
    </div>
  );
}
