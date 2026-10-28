import { NextResponse } from 'next/server';
import { requireUser, unauthorized, readJson, badRequest } from '@/lib/api';
import { db, type User } from '@/lib/db';
import { mskDayStartMs } from '@/lib/moscow-day';
import { isPlanActive, planDailyLimit } from '@/lib/plans';
import { listApplicationsPage, serializeApplication, type ApplicationRow } from '@/lib/applications';
import { getVacancyBySlug } from '@/lib/vacancies';
import { sanitizeExternalUrl } from '@/lib/vacancies/util';
import { hhProvider } from '@/lib/vacancies/hh';
import { getValidHhToken } from '@/lib/hh-oauth';
import { personalizeLetter } from '@/lib/cover-letter';
import { DEMO_MODE_MESSAGE, isLiveMode } from '@/lib/user-mode';
import { autoapplyDryRun } from '@/lib/config';
import { logApplyEvent } from '@/lib/apply-events';
import { NO_STORE_HEADERS, isUniqueViolation } from '@/lib/http';
import { claimSend, completeSend } from '@/lib/apply-outbox';
import { rateLimit } from '@/lib/rate-limit';
import {
  companyDailyCap,
  companySendsToday,
  slotKeyDaily,
  slotKeyCompany,
  tryConsumeSlot,
  refundSlot,
  todayCount,
  blockedUntil,
} from '@/lib/autoapply';
import { rankLettersForVacancy } from '@/lib/ai-matching';

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get('limit') ?? 200);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.floor(rawLimit)), 200) : 200;
  /*
   * Курсор keyset-пагинации `<sentAt>:<id>` — составной, потому что планировщик
   * шлёт пачками с одинаковым sent_at, и курсор только по времени пропускал бы
   * записи на границе. Форма строгая: молчаливый фолбэк на первую страницу
   * прятал бы баг клиента за «всё работает». Формат — тот же, что отдаёт
   * nextCursor, клиент его не собирает, а перекладывает как есть.
   */
  const rawCursor = searchParams.get('cursor');
  let cursor: { sentAt: number; id: number } | null = null;
  if (rawCursor !== null) {
    const m = /^(\d+):(\d+)$/.exec(rawCursor.trim());
    if (!m) return badRequest('Некорректный курсор');
    cursor = { sentAt: Number(m[1]), id: Number(m[2]) };
  }
  const page = listApplicationsPage(user.id, limit, cursor);
  return Response.json(
    { applications: page.items, nextCursor: page.nextCursor },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  // Отклик на hh.ru уходит во внешний API и расходует квоту платформы.
  // Дневной лимит тарифа проверяется ниже по счётчику в БД, но при параллельных
  // запросах несколько проверок успевают пройти до записи. Этот лимит закрывает
  // окно гонки и не даёт перебирать вакансии пачками.
  const limiter = rateLimit(`apply:${user.id}`, { windowMs: 60 * 1000, max: 10 });
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: 'Слишком много откликов подряд. Подождите минуту.' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds) } },
    );
  }

  const { data, error } = await readJson<{
    jobSlug?: string;
    searchId?: number | null;
    resumeId?: number | null;
    letterId?: number | null;
    externalUrl?: string | null;
  }>(request);
  if (error) return error;

  const vacancy = getVacancyBySlug(data?.jobSlug ?? '');
  if (!vacancy) return NextResponse.json({ error: 'Вакансия не найдена' }, { status: 404 });

  // Ссылка на отклик приходит от пользователя и рендерится как href. Без проверки
  // схемы в БД попадал бы любой протокол (javascript:, data:), то есть клик по
  // «ссылка на отклик» выполнил бы произвольный скрипт.
  const externalUrl = sanitizeExternalUrl(data?.externalUrl);
  if (data?.externalUrl && !externalUrl) {
    return NextResponse.json({ error: 'Ссылка должна быть http(s)-адресом' }, { status: 400 });
  }

  if (data?.searchId != null) {
    const owned = db
      .prepare('SELECT id FROM searches WHERE id = ? AND user_id = ?')
      .get(data.searchId, user.id);
    if (!owned) return NextResponse.json({ error: 'Поиск не найден' }, { status: 404 });
  }
  if (data?.resumeId != null) {
    const owned = db
      .prepare('SELECT id FROM resumes WHERE id = ? AND user_id = ?')
      .get(data.resumeId, user.id);
    if (!owned) return NextResponse.json({ error: 'Резюме не найдено' }, { status: 404 });
  }
  if (data?.letterId != null) {
    const owned = db
      .prepare('SELECT id FROM letters WHERE id = ? AND user_id = ?')
      .get(data.letterId, user.id);
    if (!owned) return NextResponse.json({ error: 'Письмо не найдено' }, { status: 404 });
  }

  if (!isPlanActive(user)) {
    return NextResponse.json(
      { error: 'Сначала активируйте пробный период или тариф' },
      { status: 403 },
    );
  }

  /*
   * Аккаунт под ограничением площадки: ручной отклик из кабинета долбил бы
   * тот же 403, что остановил планировщик. Бот проверяет это через pacing,
   * здесь — прямая проверка: иначе кнопка работала бы, пока автоотклик стоит.
   */
  const blockedUntilTs = blockedUntil(user.id);
  if (blockedUntilTs > 0) {
    return NextResponse.json(
      { error: 'hh.ru временно ограничил доступ — отклики на паузе до снятия' },
      { status: 403, headers: { 'Retry-After': String(Math.max(1, Math.ceil((blockedUntilTs - Date.now()) / 1000))) } },
    );
  }

  const limit = planDailyLimit(user.plan);
  const sentToday = todayCount(user.id);
  if (limit > 0 && sentToday >= limit) {
    // Срок — до полуночи МСК: клиент показывает «попробуйте завтра в 00:00»,
    // а не голый 429 без горизонта.
    const retryAfter = Math.max(
      1,
      Math.ceil((mskDayStartMs() + 86_400_000 - Date.now()) / 1000),
    );
    return NextResponse.json(
      { error: `Достигнут дневной лимит откликов (${limit}). Обновите тариф.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const existing = db
    .prepare('SELECT id FROM applications WHERE user_id = ? AND job_slug = ? AND withdrawn = 0')
    .get(user.id, vacancy.slug);
  if (existing) {
    return NextResponse.json({ error: 'Вы уже откликались на эту вакансию' }, { status: 409 });
  }

  /*
    Резюме выбирается ОДИН раз, и из него берутся и текст письма, и
    идентификатор, который уйдёт в hh.

    Здесь были две поломки, обе про то, что уходит на площадку, не то, что
    человек выбрал:

    1. В `applications.resume_id` записывался ЛОКАЛЬНЫЙ `resumes.id`, а
       автоотклик писал туда же ИДЕНТИФИКАТОР hh (autoapply.ts). Колонка
       объявлена TEXT и объявлена как «идентификатор резюме на hh»
       (applications.ts), но держала два разных вида значений. Читатель
       `api/applications/[id]/interview` искал по `resumes.hh_id = ?`, то
       есть для ручных откликов сравнивал hh-id с локальным числом. Не
       находил — и откатывался на «последнее обновлённое» резюме. Если у
       человека было резюме с числовым hh-id, совпавшим с чужим локальным
       id, подготовка к собеседованию строилась по ЧУЖОМУ резюме.

    2. Отправлялся всё равно `users.hh_resume_id` (строка ниже), то есть
       выбранное резюме игнорировалось: человек отметил в кабинете резюме
       под фронтенд, а отклик ушёл с тем, что привязано на уровне аккаунта.

    Теперь выбор один, и его результат — и для письма, и для отправки, и для
    записи в историю. Резюме без привязки к hh отправить нельзя: площадка
    принимает только свой идентификатор. В этом случае берётся общее
    `hh_resume_id`, как это уже делает автоотклик.
  */
  const resumeRow =
    data?.resumeId != null
      ? (db
          .prepare('SELECT id, hh_id, content, title FROM resumes WHERE id = ? AND user_id = ?')
          .get(data.resumeId, user.id) as
          { id: number; hh_id: string | null; content: string; title: string } | undefined)
      : (db
          .prepare(
            'SELECT id, hh_id, content, title FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
          )
          .get(user.id) as
          { id: number; hh_id: string | null; content: string; title: string } | undefined);
  const resumeContent = resumeRow?.content ?? '';

  const letters = db
    .prepare('SELECT id, content FROM letters WHERE user_id = ? ORDER BY updated_at DESC')
    .all(user.id) as { id: number; content: string }[];

  // Письмо выбирается один раз: явный выбор пользователя, иначе лучшее по
  // совпадению навыков с вакансией. Персонализация — один вызов, а не по одному
  // на каждое письмо (каждый вызов может ходить в LLM).
  let selectedLetterId: number | null = data?.letterId ?? null;
  if (selectedLetterId != null && !letters.some((l) => l.id === selectedLetterId)) {
    selectedLetterId = null;
  }
  if (selectedLetterId == null && letters.length > 0) {
    // Автовыбор — только при совпадении по навыкам: письмо без единого
    // совпадения хуже отсутствия письма (см. buildLetter в autoapply.ts).
    const best = rankLettersForVacancy(letters, vacancy)[0];
    if (best && best.overlap > 0) selectedLetterId = best.id;
  }

  let message = '';
  const template = letters.find((l) => l.id === selectedLetterId)?.content ?? '';
  if (selectedLetterId != null || resumeContent) {
    message = (await personalizeLetter(template, vacancy, resumeContent)).content;
  }

  const now = Date.now();

  // Реальная отправка на hh.ru: если вакансия с hh.ru и аккаунт подключён —
  // отклик уходит через API, и только при успехе записывается в кабинет.
  // origin различает их: 'real' — площадка приняла отклик, 'user' — человек
  // зафиксировал отклик, сделанный на сайте источника вручную.
  const origin = vacancy.source === 'hh' ? 'real' : 'user';
  // Заявка outbox живёт только внутри hh-ветки (там внешний эффект).
  // Объявлена здесь, чтобы блок записи ниже мог её закрыть и для user-путей
  // ничего не трогать: у ручной фиксации внешнего эффекта нет.
  let claim: { id: number } | { duplicate: true } | null = null;
  // Возврат слотов hh-ветки при гонке вставки: объявляется здесь же, чтобы
  // блок записи видел его вне ветки.
  let refundRoute: (() => void) | null = null;
  /*
   * Идентификатор резюме на hh для этого отклика.
   *
   * Объявлен здесь, а не внутри ветки hh, потому что он пишется в
   * applications.resume_id в обоих случаях: для вакансий не-hh человек
   * зафиксировал отклик вручную, но какое резюме он при этом использовал,
   * мы знаем, и history обязана это показать.
   */
  let hhResumeId: string | null = (resumeRow?.hh_id ?? '').trim() || null;
  if (vacancy.source === 'hh') {
    // Актуальное состояние подключения читаем из БД, а не из объекта сессии.
    // Отсутствие строки означает недействительную сессию — отвечаем 401,
    // а не роняем запрос TypeError'ом на fresh.hh_resume_id.
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as User | undefined;
    if (!fresh) return unauthorized();

    /*
     * Демо-режим останавливает отклик по вакансии hh.ru.
     *
     * Проверка стоит здесь, а не в планировщике: этот путь вызывается человеком
     * по кнопке, и раньше именно здесь он проходил мимо режима. Человек видел
     * в кабинете баннер «Демо-режим», нажимал «Откликнуться» — и отклик уходил
     * от его имени на hh.
     *
     * Порядок не важен для безопасности (режим проверяется до сетевого вызова),
     * но важен для внятности: человек должен получить объяснение, а не 404
     * «вакансия недоступна» или ошибку подключения hh.
     */
    if (!isLiveMode(fresh)) {
      return NextResponse.json({ error: DEMO_MODE_MESSAGE }, { status: 403 });
    }

    /*
      Идентификатор резюме для hh.

      Приоритет у выбранного резюме: человек отметил в кабинете конкретное
      под конкретную вакансию, и отправлять другое — значит врать ему в
      истории откликов. Если выбранное резюме не привязано к hh, отправить
      его нельзя (площадка принимает только свой идентификатор) — тогда
      берётся общее `users.hh_resume_id`, как это уже делает автоотклик
      (`autoapply.ts`, `fallbackResumeId`).

      Раньше здесь стояло безусловно `fresh.hh_resume_id`, то есть выбор
      человека просто не участвовал. Именно это AUDIT.md называл в пункте 8
      («подбор идёт по одному резюме, а уходит другое») — для автоотклика
      исправили, а для кнопки в кабинете нет.
    */
    if (!hhResumeId) {
      // Выбранное резюме не привязано к hh — берём общее из аккаунта.
      hhResumeId = fresh.hh_resume_id?.trim() || null;
    }
    if (!hhResumeId) {
      return NextResponse.json(
        {
          error:
            'Для отклика на вакансию hh.ru подключите аккаунт hh.ru в разделе «Настройки» (нужно резюме на hh.ru).',
        },
        { status: 400 },
      );
    }
    /*
     * Потолок на компанию — как в плановом прогоне и в боте.
     *
     * Ручной отклик из кабинета шёл мимо companyDailyCap: пачка в одну
     * компанию по кнопке выглядела для площадки так же аномально, как пачка
     * из автоотклика. Срок — до полуночи МСК, как у дневного лимита.
     */
    if (vacancy.company?.trim()) {
      const companyCap = companyDailyCap();
      if (companyCap > 0 && companySendsToday(user.id, vacancy.company) >= companyCap) {
        return NextResponse.json(
          { error: `В эту компанию сегодня уже отправлено ${companyCap}. Продолжим завтра.` },
          {
            status: 429,
            headers: {
              'Retry-After': String(
                Math.max(1, Math.ceil((mskDayStartMs() + 86_400_000 - Date.now()) / 1000)),
              ),
            },
          },
        );
      }
    }
    const valid = await getValidHhToken(fresh);
    if (!valid) {
      return NextResponse.json(
        { error: 'Подключение к hh.ru истекло. Переподключите аккаунт в «Настройках».' },
        { status: 401 },
      );
    }
    if (!hhProvider.apply) {
      return NextResponse.json({ error: 'Отклики на hh.ru недоступны' }, { status: 502 });
    }
    // Холостой режим: ручная фиксация (origin='user') пишется как обычно —
    // внешнего эффекта у неё нет, а реальный POST в hh запрещён.
    if (autoapplyDryRun()) {
      return NextResponse.json(
        { error: 'Холостой режим (AUTOAPPLY_DRY_RUN=1): отправка в hh.ru отключена' },
        { status: 503 },
      );
    }
    // Claim в outbox до сети — как в плановом прогоне. Дубликат означает, что
    // параллельный прогон уже ведёт эту вакансию: сверяемся с историей —
    // есть строка, значит «уже откликались», нет строки — «подождите минуту».
    claim = claimSend({
      userId: user.id,
      jobSlug: vacancy.slug,
      resumeId: hhResumeId,
      letterId: selectedLetterId,
      message,
    });
    if ('duplicate' in claim) {
      const done = db
        .prepare('SELECT id FROM applications WHERE user_id = ? AND job_slug = ? AND withdrawn = 0')
        .get(user.id, vacancy.slug);
      if (done) {
        return NextResponse.json({ error: 'Вы уже откликались на эту вакансию' }, { status: 409 });
      }
      return NextResponse.json(
        { error: 'Отправка уже выполняется — проверьте отклики через минуту' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    /*
     * Атомарное списание слотов: параллельный запрос и тик планировщика
     * делят одни счётчики. Проверка COUNT выше видит прошлое; слот —
     * нет. Возвраты — как в плановом прогоне.
     */
    const routeDay = mskDayStartMs();
    const routeDailySlot = slotKeyDaily(user.id, routeDay);
    const routeLeft = Math.max(0, limit - todayCount(user.id));
    if (routeLeft <= 0 || !tryConsumeSlot(routeDailySlot, routeLeft, routeDay)) {
      completeSend(claim.id);
      return NextResponse.json(
        { error: `Достигнут дневной лимит откликов (${limit}). Обновите тариф.` },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil((routeDay + 86_400_000 - Date.now()) / 1000))),
          },
        },
      );
    }
    let routeCompanySlot: string | null = null;
    if (vacancy.company?.trim()) {
      const cap = companyDailyCap();
      if (cap > 0) {
        routeCompanySlot = slotKeyCompany(user.id, vacancy.company, routeDay);
        if (!tryConsumeSlot(routeCompanySlot, cap, routeDay)) {
          refundSlot(routeDailySlot);
          completeSend(claim.id);
          return NextResponse.json(
            { error: `В эту компанию сегодня уже отправлено ${cap}. Продолжим завтра.` },
            {
              status: 429,
              headers: {
                'Retry-After': String(
                  Math.max(1, Math.ceil((routeDay + 86_400_000 - Date.now()) / 1000)),
                ),
              },
            },
          );
        }
      }
    }
    const refundRouteInner = (): void => {
      refundSlot(routeDailySlot);
      if (routeCompanySlot) refundSlot(routeCompanySlot);
    };
    refundRoute = refundRouteInner;
    let sent: Awaited<ReturnType<NonNullable<typeof hhProvider.apply>>>;
    try {
      sent = await hhProvider.apply(vacancy, {
        resumeId: hhResumeId,
        message: message || undefined,
        accessToken: valid.token,
      });
    } catch (err) {
      refundRouteInner();
      completeSend(claim.id);
      throw err;
    }
    if (!sent.ok) {
      refundRouteInner();
      completeSend(claim.id);
      logApplyEvent(user.id, vacancy.slug, 'failed', sent.error ?? 'hh отклонил (кабинет)');
      return NextResponse.json(
        { error: `hh.ru отклонил отклик: ${sent.error ?? 'неизвестная ошибка'}` },
        { status: 502 },
      );
    }
  }

  /*
   * Запись после внешней отправки — с защитой от гонки.
   *
   * Два параллельных запроса (кнопка + планировщик, двойной клик) оба проходят
   * проверку выше и оба отправляют: уникального индекса тогда не было, и в
   * историю падало два отклика. Теперь ux_applications_once не даёт вставить
   * дубль, а перехват UNIQUE превращает гонку в честный 409 «уже откликались»,
   * а не в 500. Внешняя отправка при этом уже случилась (поэтому INSERT идёт
   * после сети) — повторный разбор покажет already_applied и пропустит.
   */
  let result: { lastInsertRowid: number | bigint };
  /*
   * Ручная фиксация без hh (origin='user') внешнего эффекта не имеет, но
   * строку в лимит пишет — как и плановый прогон: todayCount считает все
   * строки, и необоснованный разрыв между счётчиком и лимитом чинить
   * сложнее, чем списать слот здесь же. hh-путь уже списал до POST.
   */
  let insertSlot: { key: string; day: number } | null = null;
  if (origin !== 'real') {
    const day = mskDayStartMs();
    const left = Math.max(0, limit - todayCount(user.id));
    if (left <= 0 || !tryConsumeSlot(slotKeyDaily(user.id, day), left, day)) {
      return NextResponse.json(
        { error: `Достигнут дневной лимит откликов (${limit}). Обновите тариф.` },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil((day + 86_400_000 - Date.now()) / 1000))),
          },
        },
      );
    }
    insertSlot = { key: slotKeyDaily(user.id, day), day };
  }
  try {
    result = db
      .prepare(
        `INSERT INTO applications (user_id, job_slug, search_id, resume_id, letter_id, status, origin, message, external_url, sent_at)
         VALUES (?, ?, ?, ?, ?, 'sent', ?, ?, ?, ?)`,
      )
      // Пишется именно selectedLetterId, а не переданный data.letterId.
      // Раньше туда уходил letterId из запроса, который для автоподбора всегда
      // null: в кабинете отклик показывался без письма, хотя в hh.ru уходило
      // персонализированное, и статистика «каким письмом откликнулись» была
      // бессмысленной.
      //
      // resume_id — ТОТ ЖЕ идентификатор, что ушёл в hh (hhResumeId), а не
      // локальный resumes.id. Раньше сюда писалось локальное число, тогда как
      // автоотклик писал hh-id, и колонка держала два разных вида значений.
      .run(
        user.id,
        vacancy.slug,
        data?.searchId ?? null,
        hhResumeId ?? null,
        selectedLetterId,
        origin,
        message,
        externalUrl,
        now,
      );
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Гонка вставки: строку записал параллельный запрос — у него свой
      // списанный слот (или свой 429), наш возвращаем.
      if (insertSlot) refundSlot(insertSlot.key);
      refundRoute?.();
      if (claim && !('duplicate' in claim)) completeSend(claim.id);
      return NextResponse.json({ error: 'Вы уже откликались на эту вакансию' }, { status: 409 });
    }
    throw err;
  }
  if (claim && !('duplicate' in claim)) completeSend(claim.id);
  const row = db
    .prepare('SELECT * FROM applications WHERE id = ?')
    .get(result.lastInsertRowid) as ApplicationRow;
  logApplyEvent(
    user.id,
    vacancy.slug,
    'sent',
    origin === 'real' ? 'вручную через кабинет (hh)' : `вручную (${origin})`,
  );
  return Response.json(
    { application: serializeApplication(row) },
    { status: 201, headers: NO_STORE_HEADERS },
  );
}
