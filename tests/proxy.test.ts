import test from "node:test";
import assert from "node:assert/strict";

test("rateLimit пропускает до max запросов", async () => {
  const { rateLimit } = await import("../src/lib/rate-limit");
  const result = rateLimit("test-key", { windowMs: 60_000, max: 3 });
  assert.equal(result.allowed, true);
  rateLimit("test-key", { windowMs: 60_000, max: 3 });
  rateLimit("test-key", { windowMs: 60_000, max: 3 });
  const blocked = rateLimit("test-key", { windowMs: 60_000, max: 3 });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("rateLimit разные ключи независимы", async () => {
  const { rateLimit } = await import("../src/lib/rate-limit");
  rateLimit("key-a", { windowMs: 60_000, max: 1 });
  const result = rateLimit("key-b", { windowMs: 60_000, max: 1 });
  assert.equal(result.allowed, true);
});

test("rotateSession возвращает null для невалидного токена", async () => {
  const { rotateSession } = await import("../src/lib/auth");
  const result = rotateSession("invalid-token");
  assert.equal(result, null);
});