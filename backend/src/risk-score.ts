import { ENV } from "./env";

type Endpoint = "challenge" | "verify" | "validate-token";

interface RiskBucket {
  challengeTs: number[];
  verifyTs: number[];
  verifyFailures: number[];
  blockedTs: number[];
  lastOrigin?: string;
}

const buckets = new Map<string, RiskBucket>();

function nowMs(): number {
  return Date.now();
}

function windowMs(): number {
  return Math.max(30, ENV.RISK_WINDOW_SECONDS) * 1000;
}

function getBucket(ip: string): RiskBucket {
  const key = ip || "unknown";
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      challengeTs: [],
      verifyTs: [],
      verifyFailures: [],
      blockedTs: [],
      lastOrigin: undefined,
    };
    buckets.set(key, bucket);
  }
  return bucket;
}

function prune(bucket: RiskBucket, now: number): void {
  const w = windowMs();
  const keep = now - w;
  bucket.challengeTs = bucket.challengeTs.filter((ts) => ts >= keep);
  bucket.verifyTs = bucket.verifyTs.filter((ts) => ts >= keep);
  bucket.verifyFailures = bucket.verifyFailures.filter((ts) => ts >= keep);
  bucket.blockedTs = bucket.blockedTs.filter((ts) => ts >= keep);
}

export function recordRiskEvent(
  ip: string,
  endpoint: Endpoint,
  outcome: "success" | "failure" | "blocked",
  origin?: string
): void {
  const now = nowMs();
  const bucket = getBucket(ip);
  prune(bucket, now);

  if (endpoint === "challenge") {
    bucket.challengeTs.push(now);
  }
  if (endpoint === "verify") {
    bucket.verifyTs.push(now);
    if (outcome === "failure") bucket.verifyFailures.push(now);
  }
  if (outcome === "blocked") {
    bucket.blockedTs.push(now);
  }

  if (origin) {
    bucket.lastOrigin = origin;
  }
}

export function assessRisk(ip: string, endpoint: Endpoint, origin?: string): { score: number; blocked: boolean } {
  const now = nowMs();
  const bucket = getBucket(ip);
  prune(bucket, now);

  let score = 0;

  // Frequency-based signals
  if (bucket.challengeTs.length > 25) score += 30;
  if (bucket.verifyTs.length > 45) score += 35;
  if (bucket.verifyFailures.length > 12) score += 25;

  // Behavior-based signals
  if (bucket.blockedTs.length > 3) score += 20;
  if (origin && bucket.lastOrigin && origin !== bucket.lastOrigin) score += 10;

  if (endpoint === "verify") score += 5;

  return {
    score,
    blocked: score >= ENV.RISK_SCORE_THRESHOLD,
  };
}

export function getRiskBucketCount(): number {
  return buckets.size;
}
