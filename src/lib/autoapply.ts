import { db, type User } from "./db";
import { isPlanActive, planDailyLimit } from "./plans";
import { matchesSearch, skillsByVacancy, type SearchRow } from "./matcher";
import { getCatalog } from "./vacancies";
import { hhProvider } from "./vacancies/hh";
import { getValidHhToken } from "./hh-oauth";
import { createPacing, type Pacing, type PacingConfig } from "./anti-ban";
import { effectivePacing } from "./config";
import { renderLetterTemplate } from "./cover-letter";
import { rankLettersForVacancy } from "./ai-matching";
import { extractSkills } from "./skills";
import type { Vacancy } from "./vacancies/types";
import { logError, logInfo } from "./logger";

/**
 * Реальный автоотклик: для каждого активного поиска находит подходящие вакансии
 * и отправляет отклики через hh.ru API от имени пользователя.
 *
 * Что изменилось и почему:
 *
 *  - ПИСЬМА. Раньше в `hhProvider.apply` уходило `message: undefined`, то есть
 *    письмо не отправлялось НИ ОДНОГО РАЗА, хотя API его поддерживает, весь
 *    раздел писем в кабинете написан, и на главной письма обещаны как
 *    отличие сервиса. Теперь письмо подбирается под конкретную вакансию.
 *  - ПОРЯДок. Раньше вакансии брались в порядке каталога, то есть отклик
 *    уходил на первую попавшуюся. Теперь — по скорингу под резюме, и пока
 *    есть выбор, лучшие вакансии расходуют лимит первыми.
 *  - КЭШ. Навыки вакансий считаются один раз на прогон, а не на каждую
 *    проверку.
 */

export type AutoApplyRun = {
  ran: boolean;
  reason?: string;
  searches: number;
  applied: number;
  failed: number;
  skipped: number;
  pausedFor: string | null;
  pausedUsers: number;
  /** Отклики, к которым приложено письмо. */
  withLetter: number;
  /** Вакансии без подходящего письма — отправлены без него. */
  withoutLetter: number;
};

function todayCount(userId: number): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const row = db
    .prepare(
      "SELECT COUNT(*) AS c FROM applications WHERE user_id = ? AND sent_at >= ? AND withdrawn = 0",
    )
    .get(userId, start.getTime()) as { c: number };
  return row.c;
}

function getActiveSearches(userId: number): SearchRow[] {
  return db
    .prepare("SELECT * FROM searches WHERE user_id = ? AND active = 1")
    .all(userId) as SearchRow[];
}

type LetterRow = { id: number; title: string; content: string };

function getLetters(userId: number): LetterRow[] {
  return db
    .prepare("SELECT id, title, content FROM letters WHERE user_id = ? ORDER BY updated_at DESC")
    .all(userId) as LetterRow[];
}

/**
 * Текст резюме пользователя — нужен, чтобы письмо опиралось на реальный опыт,
 * а не на шаблон. Берём последнее обновлённое.
 */
function getLatestResume(userId: number): { id: number; title: string; content: string } | null {
  const row = db
    .prepare("SELECT id, title, content FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1")
    .get(userId) as { id: number; title: string; content: string } | undefined;
  return row ?? null;
}

/**
 * Паузер живёт в модульной памяти и переживает вызовы runAutoApply: иначе
 * часовой и суточный лимиты сбрасывались бы на каждом тике планировщика,
 * и AntiBan не ограничивал бы ничего. Ключ — id пользователя.
 */
const pacingByUser = new Map<number, Pacing>();

function pacingFor(userId: number, cfg: Partial<PacingConfig>, nowFn: () => number): Pacing {
  const existing = pacingByUser.get(userId);
  if (existing) return existing;
  const created = createPacing(cfg, nowFn);
  pacingByUser.set(userId, created);
  return created;
}

/** Сброс паузеров (используется в тестах). */
export function resetPacing(): void {
  pacingByUser.clear();
}

/**
 * Подбор письма под вакансию.
 *
 * Берём лучшее из сохранённых писем по совпадению навыков. Если подходящих
 * нет — подставляем вакансию и компанию в шаблон пользователя.
 *
 * Почему без LLM: `personalizeLetter` ходит в сеть с таймаутом 30 секунд на
 * КАЖДУЮ вакансию. Планировщик обрабатывает пользователей по очереди, и один
 * медленный отклик к LLM задержал бы весь цикл — включая отклики других
 * пользователей. В автоотклике письмо строим шаблоном (это мгновенно),
 * а генерацию через модель оставляем там, где человек смотрит на результат
 * и может подождать, — в кабинете.
 */
async function buildLetter(
  vacancy: Vacancy,
  letters: LetterRow[],
  resumeContent: string,
): Promise<{ text: string; letterId: number | null } | null> {
  if (letters.length > 0) {
    const ranked = rankLettersForVacancy(letters, vacancy);
    const best = ranked[0];
    // Совпадение хотя бы с одним навыком вакансии — письмо релевантно.
    // Если ноль, лучше отправить резюме с минимальным шаблоном, чем чужое письмо.
    if (best && best.score > 0) {
      return { text: best.content, letterId: best.id };
    }
  }

  const template = defaultLetterTemplate(resumeContent);
  const text = renderLetterTemplate(template, vacancy).trim();
  return text ? { text, letterId: null } : null;
}

/**
 * Шаблон письма по умолчанию.
 *
 * Из резюме берётся первая строка достижения с цифрой — именно она отвечает
 * на главный вопрос работодателя «почему вы», а «Здравствуйте, меня
 * заинтересовала ваша вакансия» не отвечает ни на что.
 */
function defaultLetterTemplate(resumeContent: string): string {
  const achievement = (resumeContent ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /\d/.test(l) && l.length > 20 && l.length < 300);

  const why = achievement
    ? `В последней работе: ${achievement}.`
    : "Готов обсудить детали и показать релевантные примеры.";

  return (
    "Здравствуйте!\n\n" +
    "Меня заинтересовала вакансия {вакансия} в компании {компания} ({город}). " +
    `${why}\n\n` +
    "Буду рад обсудить задачи и рассказать, как могу быть полезен.\n\n" +
    "С уважением"
  );
}

export async function runAutoApply(opts?: {
  pacing?: Partial<PacingConfig>;
  now?: () => number;
}): Promise<AutoApplyRun> {
  const nowFn = opts?.now ?? (() => Date.now());
  const users = db.prepare("SELECT * FROM users").all() as User[];
  let searches = 0;
  let applied = 0;
  let failed = 0;
  let skipped = 0;
  let ran = false;
  let pausedFor: string | null = null;
  let pausedUsers = 0;
  let withLetter = 0;
  let withoutLetter = 0;

  for (const user of users) {
    if (!isPlanActive(user)) continue;
    const limit = planDailyLimit(user.plan);
    if (limit <= 0) continue;

    // Пользователь поставил автоотклики на паузу.
    if (user.autoapply_paused) {
      pausedUsers++;
      continue;
    }

    const activeSearches = getActiveSearches(user.id);
    if (activeSearches.length === 0) continue;
    ran = true;

    const used = todayCount(user.id);
    const remaining = Math.max(0, limit - used);
    if (remaining <= 0) continue;

    // Анти-бан: суточный лимит = остаток от тарифа (с учётом глобального
    // потолка), часовой лимит и паузы — из конфигурации.
    const base = effectivePacing(limit);
    const effectiveDaily = Math.min(remaining, base.dailyCap);
    const pacing = opts?.pacing
      ? createPacing({ ...opts.pacing, dailyLimit: effectiveDaily }, nowFn)
      : pacingFor(user.id, { ...base, dailyLimit: effectiveDaily }, nowFn);
    pacing.configure({ ...base, dailyLimit: effectiveDaily });

    const appliedSet = new Set<string>();
    const resumeId = user.hh_resume_id?.trim() || null;
    const valid = resumeId ? await getValidHhToken(user) : null;
    const token = valid?.token ?? null;

    const letters = getLetters(user.id);
    const resume = getLatestResume(user.id);
    const resumeText = resume?.content ?? "";

    // Каталог и навыки — один раз на пользователя, а не на каждый поиск.
    const catalog = getCatalog();
    const skillsCache = skillsByVacancy(catalog);

    for (const search of activeSearches) {
      if (appliedSet.size >= remaining) break;
      searches++;

      const candidates = catalog.filter(
        (v) => v.source === "hh" && matchesSearch(v, search, skillsCache.get(v.slug)),
      );
      if (candidates.length === 0) continue;

      /*
       * Порядок отправки.
       *
       * Раньше вакансии шли в порядке каталога, то есть лимит расходовался на
       * первые попавшиеся, а не на подходящие. Здесь сортируем так, чтобы
       * раньше шли те, где пересечение с резюме больше: при лимите 50 в день
       * разница между «первые 50 из каталога» и «50 самых подходящих» — это
       * разница между откликами в пустоту и откликами в ответ.
       */
      const ordered = sortByResumeOverlap(candidates, resumeText, resume?.title ?? "");

      for (const vacancy of ordered) {
        if (appliedSet.size >= remaining) break;
        if (appliedSet.has(vacancy.slug)) continue;
        // Проверяем ВОЗМОЖНОСТЬ ОТПРАВКИ (пользовательский токен + резюме),
        // а не доступность поиска по hh (токен приложения). Раньше здесь стояла
        // проверка isAvailable(), и пользователь с привязанным hh не отправлял
        // ни одного отклика, если у сервиса не было токена приложения.
        const canApply = hhProvider.canApply
          ? hhProvider.canApply(token, resumeId)
          : Boolean(token && resumeId);
        if (!canApply) {
          // Считаем только те вакансии этого поиска, которые ещё не отправлены
          // в этом прогоне. Раньше здесь стояло `skipped += candidates.length`:
          // список целиком учитывался для КАЖДОГО поиска, и уже отправленные
          // вакансии попадали в «пропущено» повторно — метрика раздувалась
          // в разы и показывала несуществующую проблему в статистике.
          skipped += ordered.filter((v) => !appliedSet.has(v.slug)).length;
          break;
        }

        const decision = pacing.decide();
        if (!decision.allowed) {
          // Любой отказ AntiBan останавливает пользователя до следующего тика.
          // Раньше условие `reason !== "night"` пропускало ночные отказы: код
          // выходил из цикла только если причина была не "night", поэтому ночью
          // отказы по часовому/суточному лимиту игнорировались.
          pausedFor = decision.reason;
          break;
        }

        const already = db
          .prepare("SELECT id FROM applications WHERE user_id = ? AND job_slug = ? AND withdrawn = 0")
          .get(user.id, vacancy.slug);
        if (already) continue;

        if (!hhProvider.apply || !resumeId) break;

        /*
         * Письмо.
         *
         * Раньше здесь было `message: undefined` — письмо не уходило никогда.
         * Теперь подбираем письмо под конкретную вакансию. Если письмо
         * построить не удалось (LLM недоступен и шаблон пуст), отклик всё
         * равно отправляется — письмо улучшает отклик, но не является его
         * условием, и лучше отправить резюме, чем не отправить ничего.
         */
        const letter = await buildLetter(vacancy, letters, resumeText);
        const message = letter?.text;

        const result = await hhProvider.apply(vacancy, {
          resumeId,
          ...(message ? { message } : {}),
          accessToken: token ?? undefined,
        });
        if (!result.ok) {
          failed++;
          pacing.recordFailure("platform");
          logError("autoapply", new Error(result.error ?? "apply failed"), {
            userId: user.id,
            slug: vacancy.slug,
          });
          continue;
        }

        pacing.recordSent();
        const now = Date.now();
        db.prepare(
          `INSERT INTO applications (user_id, job_slug, search_id, resume_id, letter_id, message, status, sent_at)
           VALUES (?, ?, ?, ?, ?, ?, 'sent', ?)`,
        ).run(
          user.id,
          vacancy.slug,
          search.id,
          user.hh_resume_id ?? null,
          letter?.letterId ?? null,
          message ?? "",
          now,
        );
        appliedSet.add(vacancy.slug);
        applied++;
        if (message) withLetter++;
        else withoutLetter++;
      }
    }

    if (appliedSet.size > 0) {
      logInfo("autoapply", `отправлено откликов: ${appliedSet.size}`, { userId: user.id });
    }
  }

  if (!ran) {
    return {
      ran: false,
      reason: "нет активных поисков у пользователей с активным тарифом",
      searches,
      applied,
      failed,
      skipped,
      pausedFor,
      pausedUsers,
      withLetter,
      withoutLetter,
    };
  }
  return { ran: true, searches, applied, failed, skipped, pausedFor, pausedUsers, withLetter, withoutLetter };
}

/**
 * Порядок отправки: сначала вакансии, где резюме пересекается с требованиями
 * сильнее.
 *
 * Считаем пересечение навыков вакансии и резюме. Это дешёвый и предсказуемый
 * признак: лимит откликов в день ограничен, и тратить его нужно на то, что
 * действительно подходит.
 */
function sortByResumeOverlap(
  vacancies: Vacancy[],
  resumeText: string,
  resumeTitle: string,
): Vacancy[] {
  if (!resumeText.trim() && !resumeTitle.trim()) return vacancies;

  const resumeSkills = new Set(extractSkills(`${resumeTitle} ${resumeText}`));
  if (resumeSkills.size === 0) return vacancies;

  // Стабильная сортировка: при равном пересечении порядок каталога сохраняется,
  // чтобы поведение не «прыгало» между прогонами.
  return vacancies
    .map((v, i) => {
      const vacancySkills = extractSkills(
        `${v.title} ${v.category} ${v.about} ${v.requirements.join(" ")}`,
      );
      const overlap = vacancySkills.filter((s) => resumeSkills.has(s)).length;
      return { v, i, overlap };
    })
    .sort((a, b) => (b.overlap - a.overlap) || (a.i - b.i))
    .map((x) => x.v);
}