import { NextResponse } from 'next/server';
import { registry } from '@/lib/payments/registry';
import { grant, revoke } from '@/lib/payments/entitlements';
import { readRawText } from '@/lib/api';

/**
 * POST /api/payments/webhook/[provider] — приём подтверждения об оплате.
 *
 * Роут намеренно БЕЗ сессии: вебхук приходит от провайдера, а не от
 * человека, и у него нет cookie. Доверие даёт не авторизация, а подпись.
 *
 * Порядок проверок именно такой, и это единственный порядок, при котором
 * безопасно:
 *   1. провайдер известен            → иначе 404;
 *   2. секрет подписи задан          → иначе 503, а не «проверка пройдена»;
 *   3. подпись сошлась               → иначе 401;
 *   4. событие разобрано             → иначе 400;
 *   5. сумма сверена с каталогом;
 *   6. права выданы идемпотентно.
 *
 * Ответ всегда 200 на «всё хорошо» и на «уже применено»: провайдер считает
 * не-2xx ошибкой доставки и будет слать снова, пока не перестанет. Повтор
 * безвреден — выдача идемпотентна.
 */
export async function POST(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const impl = registry.get(provider);
  if (!impl) {
    return NextResponse.json({ error: 'Неизвестный способ оплаты' }, { status: 404 });
  }

  // Секрет настроен на сервере? Иначе проверять нечем и принимать нельзя.
  // 503, а не 401: подпись не «не сошлась», её нечем проверять. Старое условие
  // `!ready() && !reason()` не выполнялось никогда — reason() возвращает строку
  // ровно тогда, когда ready() false.
  if (!impl.ready()) {
    return NextResponse.json(
      { error: impl.reason?.() ?? 'Способ оплаты не настроен' },
      { status: 503 },
    );
  }

  const { text: body, error: bodyError } = await readRawText(request);
  if (bodyError || body === undefined) return bodyError ?? NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  const event = impl.verify({ body, headers: request.headers });
  if (!event) {
    return NextResponse.json(
      { error: 'Подпись не сошлась или формат неизвестен' },
      { status: 401 },
    );
  }

  /*
   * Возврат отзывает права, а не выдаёт. Раньше событие "refunded" отбрасывал
   * сам verify (там принимался только "paid"): деньги возвращались, а тариф
   * оставался — подписка за чужой счёт.
   *
   * Ветка явная по kind, а не «всё остальное — grant»: будущий вид события
   * ("pending", "created") иначе упал бы в выдачу прав за неоплаченные деньги.
   * Неизвестный kind — 400, провайдер разберётся.
   */
  try {
    if (event.kind === 'refunded') {
      const applied = revoke(event);
      return NextResponse.json({ ok: true, applied, externalId: event.externalId });
    }
    if (event.kind === 'paid') {
      const applied = grant(event);
      return NextResponse.json({ ok: true, applied, externalId: event.externalId });
    }
    /*
     * Исчерпывающая проверка: после двух ветвей от kind остаётся never. Если
     * в VerifiedEvent добавится вид ("pending", "created"), tsc упадёт здесь
     * и заставит решить явно — выдать, отозвать или отклонить — вместо
     * молчаливого провала в одну из веток по умолчанию (которой больше нет).
     */
    const unknownKind: never = event.kind;
    void unknownKind;
    return NextResponse.json({ error: 'Неизвестный вид события' }, { status: 400 });
  } catch {
    // Временная ошибка БД (занята, диск): провайдер должен повторить доставку.
    return NextResponse.json({ error: 'Временная ошибка, повторите позже' }, { status: 500 });
  }
}
