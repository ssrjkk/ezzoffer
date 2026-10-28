import type { CatalogItem } from './types';

/**
 * Каталог тарифов.
 *
 * Цена и срок хранятся здесь, а не в коде проверки: смена цены не должна
 * требовать релиза, а вебхук сверяет пришедшую сумму именно с этим списком.
 * Если бы сумма приходила из тела вебхука и оттуда же бралась «цена»,
 * подделанный платёж в 1 рубль выдавал бы Expert.
 *
 * Числа — те же, что на витрине (data.ts, цены за 30 дней): два источника
 * цен уже расходились (каталог говорил 990/2490/4990, витрина — 1990/2990/
 * 5990), и человек платил бы не ту сумму, что видел. Источник правды один.
 *
 * `beta_life` — подписка без срока на время беты. Срок не хранится вовсе
 * (permanent), потому что любое значение в plan_expires_at для него — ошибка:
 * «истечёт через год» здесь означало бы, что вечность кончилась.
 */
export const CATALOG: CatalogItem[] = [
  {
    id: 'beta_life',
    title: 'Навсегда, пока в бете',
    priceRub: 0,
    days: 0,
    lifetime: true,
    permanent: true,
    methods: ['card', 'sbp', 'crypto_usdt'],
    features: [
      'Все лимиты тарифа «Эксперт» — 250 откликов в день',
      'AI-first упаковка резюме без лимитов',
      'Без ограничения срока на время бета-периода',
      'Прямой доступ к живым откликам на hh.ru',
    ],
  },
  {
    id: 'start',
    title: 'Старт',
    priceRub: 1990,
    days: 30,
    lifetime: false,
    permanent: false,
    methods: ['card', 'sbp', 'crypto_usdt'],
    features: ['50 откликов в день', '5 резюме', 'Подбор вакансий'],
  },
  {
    id: 'pro',
    title: 'Про',
    priceRub: 2990,
    days: 30,
    lifetime: false,
    permanent: false,
    methods: ['card', 'sbp', 'crypto_usdt'],
    features: ['100 откликов в день', '20 резюме', 'Личные письма', 'Аналитика пробелов'],
  },
  {
    id: 'expert',
    title: 'Эксперт',
    priceRub: 5990,
    days: 30,
    lifetime: false,
    permanent: false,
    methods: ['card', 'sbp', 'crypto_usdt'],
    features: [
      '250 откликов в день',
      'Резюме без ограничения',
      'AI-first упаковка резюме без лимитов',
      'Telegram-бот',
      'Разбор отказов и конверсии',
    ],
  },
];

export function catalogItem(id: string): CatalogItem | undefined {
  return CATALOG.find((c) => c.id === id);
}
