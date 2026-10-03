import { appendFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, renameSync } from "node:fs";
import { join } from "node:path";

function silent(): boolean {
  return process.env.EZOFFER_SILENT === "1";
}

function logFile(): string | null {
  if (process.env.NODE_ENV !== "production") return null;
  const dir = process.env.EZOFFER_LOG_DIR ?? "./data/logs";
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "app.log");
}

function rotateLog(file: string): void {
  try {
    const dir = join(file, "..");
    const files = readdirSync(dir)
      .filter((f: string) => f.startsWith("app.log"))
      .sort();
    while (files.length > 5) {
      const oldest = files.shift();
      if (oldest) unlinkSync(join(dir, oldest));
    }
    if (existsSync(file)) {
      renameSync(file, join(dir, `app.log.${Date.now()}`));
    }
  } catch {
    /* ignore */
  }
}

function writeToFile(line: string): void {
  const file = logFile();
  if (!file) return;
  try {
    rotateLog(file);
    appendFileSync(file, line + "\n", "utf8");
  } catch {
    /* ignore */
  }
}

export function logError(scope: string, err: unknown, meta?: Record<string, unknown>): void {
  if (silent()) return;
  const ts = new Date().toISOString();
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  const suffix = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  const line = `[${ts}] [error] ${scope}: ${msg}${suffix}`;
  console.error(line);
  writeToFile(line);
}

export function logInfo(scope: string, message: string, meta?: Record<string, unknown>): void {
  if (silent()) return;
  const ts = new Date().toISOString();
  const suffix = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  const line = `[${ts}] [info] ${scope}: ${message}${suffix}`;
  console.log(line);
  writeToFile(line);
}