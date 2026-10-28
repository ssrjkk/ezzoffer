import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listBookmarks } from '@/lib/bookmarks';
import { BookmarksList } from '@/components/dashboard/bookmarks-list';

export const metadata: Metadata = { title: 'Избранное' };
export const dynamic = 'force-dynamic';

export default async function BookmarksPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  /*
   * Данные собираются на сервере, а не отдельным запросом из браузера: список
   * нужен сразу при открытии, и мигающая пустая страница выглядела бы как
   * «избранное пропало».
   */
  const bookmarks = listBookmarks(user.id);

  return (
    <div>
      <h1 className="font-serif text-2xl leading-snug text-ink">Избранное</h1>
      <p className="mt-1 text-sm text-muted">
        Вакансии, которые вы отложили. Быстрые источники каталога обновляются каждые полчаса, поэтому хорошую вакансию
        стоит сохранить — иначе она уйдёт из подбора.
      </p>
      <div className="mt-6">
        <BookmarksList bookmarks={bookmarks} />
      </div>
    </div>
  );
}
