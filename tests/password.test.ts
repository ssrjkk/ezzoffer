import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/lib/password";

test("hashPassword/verifyPassword: корректный пароль проходит", () => {
  const stored = hashPassword("secret123");
  assert.match(stored, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(verifyPassword("secret123", stored), true);
});

test("hashPassword/verifyPassword: неверный пароль отклоняется", () => {
  const stored = hashPassword("secret123");
  assert.equal(verifyPassword("wrong", stored), false);
});

test("verifyPassword: некорректный формат хранимого значения", () => {
  assert.equal(verifyPassword("secret123", "not-a-hash"), false);
  assert.equal(verifyPassword("secret123", ""), false);
});

test("hashPassword даёт разные соли", () => {
  assert.notEqual(hashPassword("secret123"), hashPassword("secret123"));
});