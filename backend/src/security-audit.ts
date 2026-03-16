import { appendFileSync, existsSync, mkdirSync } from "fs";
import { basename, dirname, extname, isAbsolute, join } from "path";
import { ENV } from "./env";

type AuditLevel = "info" | "warn" | "error";

function resolveAuditPath(): string {
  const configured = ENV.SECURITY_AUDIT_LOG_PATH?.trim() || "data/security-events.jsonl";
  if (isAbsolute(configured)) return configured;
  return join(import.meta.dir, "..", configured);
}

const AUDIT_PATH = resolveAuditPath();

function withDailySuffix(filePath: string, date: Date): string {
  const ext = extname(filePath);
  const base = basename(filePath, ext || undefined);
  const dir = dirname(filePath);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const suffix = `${yyyy}-${mm}-${dd}`;
  const finalExt = ext || ".jsonl";
  return join(dir, `${base}-${suffix}${finalExt}`);
}

function resolveWritePath(date: Date): string {
  if (!ENV.SECURITY_AUDIT_DAILY_ROLLING) return AUDIT_PATH;
  return withDailySuffix(AUDIT_PATH, date);
}

function ensureAuditDir(): void {
  const dir = dirname(AUDIT_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function validateSecurityAuditSink(): void {
  if (!ENV.ENABLE_SECURITY_AUDIT_LOG) return;

  try {
    ensureAuditDir();
    const path = resolveWritePath(new Date());
    appendFileSync(path, "", "utf-8");
  } catch (error) {
    if (ENV.SECURITY_AUDIT_STRICT || ENV.IS_PRODUCTION) {
      throw new Error(`Security audit log sink unavailable: ${String(error)}`);
    }
    console.warn("⚠️  Security audit log sink unavailable; continuing in best-effort mode");
  }
}

export function writeSecurityAudit(eventType: string, level: AuditLevel, data: Record<string, unknown>): void {
  if (!ENV.ENABLE_SECURITY_AUDIT_LOG) return;

  try {
    ensureAuditDir();
    const now = new Date();
    const path = resolveWritePath(now);
    const payload = {
      ts: now.toISOString(),
      eventType,
      level,
      meta: {
        instanceId: ENV.INSTANCE_ID,
        nodeEnv: ENV.NODE_ENV,
        pid: typeof process !== "undefined" ? process.pid : undefined,
      },
      data,
    };
    appendFileSync(path, `${JSON.stringify(payload)}\n`, "utf-8");
  } catch {
    // Best-effort logging only; avoid impacting auth/captcha flow.
  }
}
