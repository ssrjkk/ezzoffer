/**
 * Состояния переписки на hh.ru и их перевод во внутренний статус.
 *
 * Отдельный модуль, а не условия внутри цикла синхронизации, потому что
 * соответствие состояний платформы и наших статусов — это факт о площадке,
 * а не логика приложения. Он должен читаться и проверяться сам по себе.
 *
 * Что здесь было не так.
 *
 * Синхронизация смотрела на четыре состояния: `viewed`, `invitation`,
 * `offer`, `chat`. Всё остальное молча игнорировалось. Последствия:
 *
 *  - «Отказы» в статистике равнялись нулю ВСЕГДА. Поле `decline` считалось
 *    в `getStats`, но не записывалось ни одним местом в коде. Человек смотрит
 *    на панель, видит «Отказы: 0» и делает вывод, что его не отказывают, —
 *    тогда как отказы были и происходили.
 *  - Отказ отличался от «просто не ответили» нулём, то есть подсказка
 *    «проверьте резюме» не могла появиться: в данных не было факта отказа.
 *  - Состояния вроде `screening` (HR взял в работу) считались «вопросом»,
 *    хотя это не вопрос соискателю.
 *
 * Список состояний взят из документации hh.ru по переписке.
 */

/** Внутренние статусы отклика. */
export type AppResponse =
  /** Отправлен, реакции нет. */
  | ""
  /** HR посмотрел резюме, но не ответил. */
  | "viewed"
  /** HR задал вопрос — нужно ответить. */
  | "question"
  /** Приглашение на собеседование. */
  | "interview"
  /** Вакансия закрыта, отказ. */
  | "decline"
  /** Соискатель отказался сам. */
  | "withdrawn";

/**
 * Состояния hh → наш статус.
 *
 * Отдельно оговорено, чего в мапе нет:
 *  - `on_hold` (работодатель поставил на паузу) — это не отказ и не ответ,
 *    отклик жив. Приравнивать его к отказу было бы прямой ложью в статистике.
 *  - `success` (предложение работы) — на hh это «вас взяли». В нашей модели
 *    статуса оффера нет, он раньше выражался через `offer` в state.name, и
 *    держать отдельную ветку ради одного значения значило бы раздувать схему.
 *    Состояние само по себе информативно, поэтому оно попадает в response_note.
 */
const STATE_TO_RESPONSE: Record<string, AppResponse> = {
  // Свежий отклик, реакции нет.
  apply: "",
  init: "",
  in_progress: "",

  // Просмотр резюме.
  viewed: "viewed",

  // Реакция HR.
  question: "question",
  chat: "question",
  chat_message: "question",
  screening: "question",

  // Приглашение.
  invitation: "interview",
  invited: "interview",
  offer: "interview",

  // Отказы.
  rejected: "decline",
  rejected_after_review: "decline",
  declined: "decline",
  discarded: "decline",
  cancelled: "decline",
  invalid: "decline",
  not_relevant: "decline",
};

/** Состояния, при которых работодатель точно видел резюме. */
const VIEWED_STATES = new Set(["viewed", "question", "chat", "chat_message", "screening", "invitation", "invited", "offer"]);

/** Состояния, при которых отклик окончательно закрыт. */
const CLOSED_STATES = new Set(["rejected", "rejected_after_review", "declined", "discarded", "cancelled", "invalid", "not_relevant"]);

/** Наш статус для состояния hh. Неизвестные состояния — «нет ответа». */
export function responseForHhState(state: string | null | undefined): AppResponse {
  if (!state) return "";
  return STATE_TO_RESPONSE[state] ?? "";
}

/** Видел ли работодатель резюме в этом состоянии. */
export function isViewedState(state: string | null | undefined): boolean {
  if (!state) return false;
  return VIEWED_STATES.has(state);
}

/** Закрыт ли отклик окончательно. */
export function isClosedState(state: string | null | undefined): boolean {
  if (!state) return false;
  return CLOSED_STATES.has(state);
}

/**
 * Человекочитаемое имя состояния.
 *
 * Нужно не для украшения: при отказе hh обычно присылает причину в state.name
 * («Отказ по причине отсутствия опыта», «Вакансия закрыта»), и именно она
 * объясняет пользователю, что именно не сработало. Раньше причина
 * терялась: сохранялось только слово «interview» или «question».
 */
export function hhStateLabel(state: string | null | undefined): string | null {
  if (!state) return null;
  return state.replace(/_/g, " ");
}