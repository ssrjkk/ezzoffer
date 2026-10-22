import { NextResponse } from 'next/server';
import { requireUser, unauthorized } from '@/lib/api';
import { hhConfigured, hhAuthUrl, generateOauthState } from '@/lib/hh-oauth';
import { db } from '@/lib/db';
import { NO_STORE_HEADERS } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';

// Старт OAuth-подключения к hh.ru
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  if (!hhConfigured()) {
    return NextResponse.json(
      { error: 'Подключение к hh.ru не настроено на сервере' },
      { status: 503 },
    );
  }

  /*
   * GET пишет в БД (строка oauth_states), поэтому лимит нужен и здесь:
   * без него таблицу можно растить бесконечно простыми запросами. Лимит
   * персональный — 10 подключений в 10 минут на человека хватает с запасом.
   */
  const limiter = rateLimit(`hh-connect:${user.id}`, { windowMs: 10 * 60 * 1000, max: 10 });
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } },
    );
  }

  const state = generateOauthState();
  const expires = Date.now() + 15 * 60 * 1000;
  db.prepare('INSERT INTO oauth_states (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    state,
    user.id,
    expires,
  );

  return NextResponse.json({ url: hhAuthUrl(state) }, { headers: NO_STORE_HEADERS });
}
