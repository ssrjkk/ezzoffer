import { NextResponse } from 'next/server';
import { db, type User } from '@/lib/db';
import { exchangeCode, fetchHhResumeId, saveHhConnection } from '@/lib/hh-oauth';
import { logError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  if (errorParam || !code || !state) {
    return NextResponse.redirect(new URL('/dashboard/settings?hh=error', request.url));
  }

  const row = db.prepare('SELECT * FROM oauth_states WHERE token = ?').get(state) as
    { user_id: number; expires_at: number } | undefined;
  if (!row || row.expires_at <= Date.now()) {
    return NextResponse.redirect(new URL('/dashboard/settings?hh=expired', request.url));
  }
  db.prepare('DELETE FROM oauth_states WHERE token = ?').run(state);
  // Заодно выметаем протухшие чужие state: без чистки таблица растёт
  // бесконечно — каждый заход на /api/hh/connect оставляет строку.
  db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').run(Date.now());

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) as User | undefined;
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const token = await exchangeCode(code);
    if (!token.access_token) {
      logError('hh:oauth', new Error(token.error ?? 'exchange failed'), {
        description: token.error_description,
      });
      return NextResponse.redirect(new URL('/dashboard/settings?hh=failed', request.url));
    }
    const resumeId = await fetchHhResumeId(token.access_token);
    if (!resumeId) {
      /*
       * Соединение НЕ затираем: null означает и «у пользователя нет резюме»,
       * и «сеть чихнула». Стирание рабочего подключения по транзиентной
       * ошибке сбрасывало человека в demo посреди живых откликов — и чинить
       * было нечего, кроме повторного OAuth-круга. Старые значения остаются,
       * человек видит «не удалось» и пробует снова.
       */
      return NextResponse.redirect(new URL('/dashboard/settings?hh=failed', request.url));
    }
    saveHhConnection(
      user,
      token.access_token,
      token.refresh_token,
      token.expires_in ?? 3600,
      resumeId,
    );
    return NextResponse.redirect(new URL('/dashboard/settings?hh=ok', request.url));
  } catch (err) {
    logError('hh:oauth', err);
    return NextResponse.redirect(new URL('/dashboard/settings?hh=failed', request.url));
  }
}
