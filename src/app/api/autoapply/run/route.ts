import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runAutoApply } from '@/lib/autoapply';
import { saveLastRun } from '@/lib/autoapply-store';
import { NO_STORE_HEADERS } from '@/lib/http';
import { tryLockSession, lockHeldAtKey, APPLY_LOCK_KEY } from '@/lib/scheduler';
import { logError } from '@/lib/logger';
import { db } from '@/lib/db';

/** Сравнение секрета за постоянное время: ранний выход по первому байту — побочный канал. */
function secretEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/*
 * Запуск автооткликов по требованию. Защищён CRON_SECRET (или переданным ключом),
 * чтобы злоумышленник не мог дёргать воркер произвольно.
 *
 * Запуск берёт ту же блокировку, что и планировщик. Раньше он вызывал
 * runAutoApply напрямую, мимо acquireLock, и это приводило к двум
 * одновременным прогонам — планировщику по расписанию и этому ручному.
 *
 * Дубли не были фантастикой. Защита от повторной отправки проверяет наличие
 * строки в applications, и проверка происходит ДО сетевого вызова в hh:
 *
 *     SELECT id FROM applications WHERE user_id = ? AND job_slug = ? ...
 *     ...
 *     await hhProvider.apply(vacancy, ...)   ← здесь оба прогона ждут сеть
 *     INSERT INTO applications ...
 *
 * Между SELECT и INSERT есть await сетевого запроса. Два прогона проходят
 * проверку одновременно, оба отправляют отклик, оба вставляют строку. Человек
 * получает два отклика на одну вакансию от своего имени — а это ровно то, за
 * что площадка блокирует аккаунт.
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET не настроен' }, { status: 503 });
  }
  const auth = request.headers.get('authorization') ?? '';
  if (!secretEqual(auth, `Bearer ${expected}`)) {
    return NextResponse.json({ error: 'Не авторизовано' }, { status: 401 });
  }

  // Ручной запуск делит с планировщиком только apply-лок: каталог и
  // синхронизация при этом идут своим чередом, а не ждут конца прогона.
  const now = Date.now();
  const session = tryLockSession(db, APPLY_LOCK_KEY, now);
  if (!session) {
    /*
     * 409, а не запуск «вторым». Молчаливый запуск здесь означал бы ровно то,
     * ради чего блокировка и нужна: два прогона в одном процессе.
     *
     * В ответе — когда метка появилась: по ней видно, идёт ли сейчас плановый
     * тик (обычное дело, ждать минуту) или блокировка зависла после сбоя (тогда
     * она спадёт сама по TTL в 30 минут).
     */
    const heldAt = lockHeldAtKey(db, APPLY_LOCK_KEY);
    return NextResponse.json(
      {
        error: 'Прогон уже выполняется',
        running: true,
        // Метка — время начала текущего прогона, а не остаток.
        startedAt: heldAt || null,
      },
      {
        status: 409,
        headers: { ...NO_STORE_HEADERS, 'Retry-After': '60' },
      },
    );
  }

  /*
   * Прогон уходит в фон, ответ — 202 сразу: тик теперь длится десятки минут
   * (паузы внутри), и HTTP-клиент убил бы соединение задолго до конца.
   * Итог пишется в saveLastRun, панель читает его из /api/autoapply/state.
   * Сессия снимает свой лок сама; heartbeat внутри прогона продлевает его.
   */
  void (async () => {
    try {
      saveLastRun(await runAutoApply({ heartbeat: () => session.heartbeat() }));
    } catch (err) {
      logError('autoapply:run', err instanceof Error ? err : new Error(String(err)));
    } finally {
      session.release();
    }
  })();
  return NextResponse.json({ ok: true, started: true }, { status: 202, headers: NO_STORE_HEADERS });
}
