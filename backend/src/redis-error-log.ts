import { appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname, isAbsolute, join } from "path";
import { ENV } from "./env";

function resolveLogPath(): string {
  const configured = ENV.REDIS_ERROR_LOG_PATH?.trim() || "data/redis_errors.log";
  if (isAbsolute(configured)) return configured;
  return join(import.meta.dir, "..", configured);
}

const LOG_PATH = resolveLogPath();

function ensureLogDir(): void {
  const dir = dirname(LOG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function validateRedisErrorLogSink(): void {
  if (!ENV.ENABLE_REDIS_ERROR_LOG) return;

  try {
    ensureLogDir();
    appendFileSync(LOG_PATH, "", "utf-8");
  } catch (error) {
    console.warn(`⚠️  Redis error log sink unavailable; continuing in best-effort mode: ${String(error)}`);
  }
}

export function writeRedisError(err: unknown): void {
  if (!ENV.ENABLE_REDIS_ERROR_LOG) return;

  try {
    ensureLogDir();
    const now = new Date();
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const payload = {
      ts: now.toISOString(),
      message,
      ...(stack ? { stack } : {}),
    };
    appendFileSync(LOG_PATH, `${JSON.stringify(payload)}\n`, "utf-8");
  } catch {
    // Best-effort logging only; avoid impacting the main flow.
  }
}
