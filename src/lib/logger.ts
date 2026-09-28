function silent(): boolean {
  return process.env.EZOFFER_SILENT === "1";
}

export function logError(scope: string, err: unknown, meta?: Record<string, unknown>): void {
  if (silent()) return;
  const ts = new Date().toISOString();
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  const suffix = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  console.error(`[${ts}] [error] ${scope}: ${msg}${suffix}`);
}

export function logInfo(scope: string, message: string, meta?: Record<string, unknown>): void {
  if (silent()) return;
  const ts = new Date().toISOString();
  const suffix = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${ts}] [info] ${scope}: ${message}${suffix}`);
}