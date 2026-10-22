import { NextResponse } from 'next/server';
import { requireUser, unauthorized } from '@/lib/api';
import { db } from '@/lib/db';
import { parseParamId } from '@/lib/http';
import { getValidHhToken } from '@/lib/hh-oauth';
import { cloneHhResume, canCreateHhResume } from '@/lib/hh-resumes';
import { NO_STORE_HEADERS } from '@/lib/http';

/**
 * POST /api/resumes/[id]/clone — копия резюме на hh.ru.
 *
 * Закрывает пробел «вариант есть только локально»: клонирует привязанное
 * резюме на стороне hh одной кнопкой. Дальше человек правит копию на hh
 * (там валидация и подсказки), а обратно забирает её существующим импортом —
 * тот и привяжет новый hh_id. Прямой заливки локального текста в hh-структуру
 * здесь нет сознательно: маппинг свободного текста в блоки hh с их
 * справочниками писал бы человеку в профиль мусор при первой же ошибке.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { id: rawId } = await ctx.params;
  const id = parseParamId(rawId);
  if (id === null) return NextResponse.json({ error: 'Некорректный id' }, { status: 400 });

  const row = db
    .prepare('SELECT id, hh_id, title FROM resumes WHERE id = ? AND user_id = ?')
    .get(id, user.id) as { id: number; hh_id: string | null; title: string } | undefined;
  if (!row) return NextResponse.json({ error: 'Резюме не найдено' }, { status: 404 });
  if (!row.hh_id) {
    return NextResponse.json(
      { error: 'Копировать можно только привязанное резюме: сначала импортируйте его с hh' },
      { status: 400 },
    );
  }

  const valid = await getValidHhToken(user);
  if (!valid?.token) {
    return NextResponse.json({ error: 'Подключите аккаунт hh.ru в настройках' }, { status: 401 });
  }
  if (!(await canCreateHhResume(valid.token))) {
    return NextResponse.json(
      { error: 'hh.ru не разрешает создать ещё одно резюме (лимит площадки)' },
      { status: 409 },
    );
  }

  const result = await cloneHhResume(valid.token, row.hh_id);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return Response.json(
    {
      hhResumeId: result.id,
      hhUrl: `https://hh.ru/resume/${result.id}`,
      hint: 'Копия создана на hh.ru. Отредактируйте её там и заберите обратно кнопкой «Импорт с hh» — она привяжется как отдельное резюме.',
    },
    { headers: NO_STORE_HEADERS },
  );
}
