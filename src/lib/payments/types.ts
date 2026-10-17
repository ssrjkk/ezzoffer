/**
 * Типы фундамента оплаты.
 *
 * Способ оплаты — это реализация одного интерфейса плюс запись в каталоге.
 * Добавление СБП, карты или крипты не должно требовать правок в логике
 * выдачи прав: иначе каждый новый способ станет отдельным изменением
 * проверенного кода, и одна из интеграций рано или поздно будет забыта.
 */

export type MethodId = "card" | "sbp" | "crypto_usdt" | (string & {});

export type CatalogItem = {
  id: string;
  /** Название для интерфейса. */
  title: string;
  /** Цена в рублях. Крипта считает по курсу на момент оплаты. */
  priceRub: number;
  /** Дней подписки; 0 вместе с permanent. */
  days: number;
  /** Подписка без срока («пока продукт в бете»). */
  lifetime: boolean;
  /** Признак, что срок не хранится вовсе. */
  permanent: boolean;
  methods: MethodId[];
  /** Что входит: показывается на странице тарифов. */
  features: string[];
};

export type PaymentIntent = {
  /** Идентификатор счёта на стороне провайдера. */
  invoiceId: string;
  /** Куда платить: адрес, ссылка на оплату или id платёжной сессии. */
  address?: string;
  /** Ссылка на страницу оплаты, если метод её требует. */
  payUrl?: string;
  /** Сколько ждать до истечения счёта, мс. */
  expiresInMs: number;
};

export type VerifiedEvent = {
  /** Идентификатор платежа у провайдера. */
  externalId: string;
  /** Кому платёж: id пользователя. */
  userId: number;
  planId: string;
  /** Сумма в рублях — сверяется с каталогом. */
  amountRub: number;
  method: MethodId;
  paidAt: number;
};

export type PaymentProvider = {
  id: MethodId;
  title: string;
  /** Готов ли к работе прямо сейчас: ключи и адреса на месте. */
  ready: () => boolean;
  /** Почему не готов, для показа в интерфейсе. */
  reason?: () => string | null;
  createIntent: (input: { userId: number; planId: string }) => PaymentIntent;
  /**
   * Проверяет подпись и разбирает событие.
   *
   * Возвращает null, если подпись не сошлась или формат неизвестен. Это
   * единственная точка доверия: всё, что дальше, опирается на её результат.
   */
  verify: (request: { body: string; headers: Headers }) => VerifiedEvent | null;
};