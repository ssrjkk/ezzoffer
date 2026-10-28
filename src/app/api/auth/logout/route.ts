import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { destroySession, SESSION_COOKIE, isHttpsRequest } from '@/lib/auth';

export async function POST(request: Request) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) destroySession(token);
  const res = NextResponse.json({ ok: true });
  /*
   * secure зеркалим тоже: на HTTPS cookie ставилась с secure:true, и часть
   * браузеров удаление без флага игнорирует — мусор остаётся в браузере.
   * Токен при этом уже убит сервером, так что это гигиена, а не дыра.
   */
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: isHttpsRequest(request),
  });
  return res;
}
