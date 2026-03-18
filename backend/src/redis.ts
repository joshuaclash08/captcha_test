import Redis from "ioredis";
import { writeRedisError } from "./redis-error-log";

// Use REDIS_URL from env, or default to localhost:6379
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL);

redis.on("error", (err) => {
  console.error("Redis connection error:", err);
  writeRedisError(err);
});

redis.on("connect", () => {
  console.log("✅ Connected to Redis");
});
