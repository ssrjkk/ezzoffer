import test from "node:test";
import assert from "node:assert/strict";
import {
  responseForHhState,
  isViewedState,
  isClosedState,
  hhStateLabel,
} from "../src/lib/hh-states";

/**
 * Соответствие состояний hh.ru внутренним статусам.
 *
 * Регрессия: синхронизация смотрела на четыре состояния (`viewed`,
 * `invitation`, `offer`, `chat`) и молча игнорировала все остальные.
 * Последствия были не косметические:
 *
 *  - «Отказы» в статистике были нулем ВСЕГДА — `decline` считался в getStats,
 *    но не записывался ни одной строкой в коде. Человек видел «Отказы: 0» и
 *    думал, что его не отказывают;
 *  - отличить «отказ» от «просто не ответили» было невозможно, значит
 *    подсказка «проверьте резюме» не могла появиться;
 *  - `screening` (HR взял в работу) считался вопросом соискателю.
 *
 * Отдельно проверяется то, что НЕ должно считаться отказом: `on_hallow`
 * и подобные — это пауза, отклик жив.
 */

test("отказы с площадки распознаются как отказы", () => {
  for (const state of [
    "rejected",
    "rejected_after_review",
    "declined",
    "discarded",
    "cancelled",
    "invalid",
    "not_relevant",
  ]) {
    assert.equal(
      responseForHhState(state),
      "decline",
      `состояние «${state}» не распознано как отказ`,
    );
    assert.ok(isClosedState(state), `«${state}» не считается закрытым`);
  }
});

test("приглашение распознаётся как собеседование", () => {
  for (const state of ["invitation", "invited", "offer"]) {
    assert.equal(responseForHhState(state), "interview", `«${state}» не приглашение`);
  }
});

test("вопрос HR распознаётся как вопрос, а HR-скрининг не путается с отказом", () => {
  assert.equal(responseForHhState("question"), "question");
  assert.equal(responseForHhState("chat"), "question");
  assert.equal(
    responseForHhState("screening"),
    "question",
    "screening — это работа HR, а не отказ и не ответ соискателю",
  );
});

test("пауза работодателя не считается ни отказом, ни ответом", () => {
  /*
   * on_hold — «работодатель взял отклик на паузу». Отклик жив. Приравнивать
   * его к отказу было бы прямой ложью в статистике: человек увидел бы
   * десяток отказов, которых не было.
   */
  assert.equal(responseForHhState("on_hold"), "", "пауза засчитана как результат");
  assert.ok(!isClosedState("on_hold"), "пауза засчитана как закрытие");
});

test("просмотр резюме отмечается, но не как ответ", () => {
  assert.equal(responseForHhState("viewed"), "viewed");
  assert.ok(isViewedState("viewed"), "просмотр не отмечен");
  assert.ok(!isClosedState("viewed"), "просмотр засчитан как закрытие");
});

test("вопрос и приглашение тоже означают просмотр", () => {
  // Иначе знаменатель «просмотрено» оказывался бы меньше числителя
  // «ответили», и конверсия выходила бы выше 100%.
  for (const state of ["question", "invitation", "offer", "screening"]) {
    assert.ok(isViewedState(state), `«${state}» не означает просмотр`);
  }
});

test("неизвестное состояние не превращается в отказ", () => {
  /*
   * Площадка добавляет состояния. Неизвестное должно означать «нет
   * реакции», а не «отказ»: иначе появление нового состояния на hh
   * молча испортило бы статистику у всех пользователей разом.
   */
  for (const state of ["что-то_новое", "some_new_state", "", null, undefined]) {
    assert.equal(
      responseForHhState(state),
      "",
      `неизвестное состояние «${state}» истолковано как результат`,
    );
    assert.ok(!isClosedState(state), `«${state}» засчитано как закрытие`);
  }
});

test("причина отказа сохраняется текстом", () => {
  // hh присылает причину в state.name, и именно она объясняет пользователю,
  // что не сработало. Раньше причина терялась: сохранялось «interview».
  assert.equal(
    hhStateLabel("rejected_after_review"),
    "rejected after review",
    "подпись состояния не читается",
  );
  assert.equal(hhStateLabel(null), null);
});