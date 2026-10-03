import test from "node:test";
import assert from "node:assert/strict";

test("backup module exports startBackupScheduler", async () => {
  const mod = await import("../src/lib/backup");
  assert.equal(typeof mod.startBackupScheduler, "function");
});