import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "crypto";
import { ENV } from "./env";

/**
 * AES-256-GCM encryption key.
 * Must match the XOR-derived key in wasm/src/decrypt.rs:
 *   KEY[i] = KEY_SEED[i] ^ KEY_MASK[i]
 * 
 * Production: Set AES_KEY_SEED and AES_KEY_MASK environment variables
 * Development: Uses hardcoded default keys (DO NOT USE IN PRODUCTION)
 */
const DEFAULT_KEY_SEED = Buffer.from([
  0xa3, 0x7b, 0x12, 0xde, 0x45, 0x9f, 0x01, 0xc8, 0x67, 0x3a, 0xee, 0x54,
  0xb1, 0x0d, 0x82, 0xf6, 0x29, 0x73, 0xc4, 0x5e, 0x90, 0x1a, 0xdb, 0x47,
  0xf8, 0x6c, 0x35, 0xa9, 0x0e, 0xb7, 0x64, 0x21,
]);

const DEFAULT_KEY_MASK = Buffer.from([
  0xf1, 0x2c, 0x59, 0x8a, 0x03, 0xd7, 0x6e, 0xb5, 0x34, 0x48, 0xad, 0x16,
  0xe3, 0x5f, 0xc0, 0x92, 0x7d, 0x31, 0x86, 0x0b, 0xf4, 0x6a, 0x99, 0x05,
  0xba, 0x2e, 0x77, 0xe1, 0x4c, 0xd5, 0x28, 0x63,
]);

function getKeys(): { seed: Buffer; mask: Buffer } {
  if (ENV.IS_PRODUCTION && (!ENV.AES_KEY_SEED || !ENV.AES_KEY_MASK)) {
    throw new Error("AES_KEY_SEED and AES_KEY_MASK must be set in production");
  }

  if (ENV.AES_KEY_SEED && ENV.AES_KEY_MASK) {
    return {
      seed: Buffer.from(ENV.AES_KEY_SEED, "hex"),
      mask: Buffer.from(ENV.AES_KEY_MASK, "hex"),
    };
  }
  return { seed: DEFAULT_KEY_SEED, mask: DEFAULT_KEY_MASK };
}

const { seed: KEY_SEED, mask: KEY_MASK } = getKeys();

const KEY = Buffer.alloc(32);
for (let i = 0; i < 32; i++) {
  KEY[i] = KEY_SEED[i] ^ KEY_MASK[i];
}

/**
 * Encrypt a payload with AES-256-GCM.
 * Output format: [nonce 12B] + [ciphertext] + [auth_tag 16B]
 * This matches what the WASM `decrypt_payload` function expects.
 */
export function encryptPayload(data: Uint8Array): Uint8Array {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, nonce);

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes

  // Concatenate: nonce + ciphertext + tag
  const result = new Uint8Array(12 + encrypted.length + 16);
  result.set(nonce, 0);
  result.set(encrypted, 12);
  result.set(tag, 12 + encrypted.length);

  return result;
}

/**
 * Verify AES key can round-trip encrypt/decrypt.
 * Call on startup to ensure WASM and server share the same key.
 */
export function verifyKeySync(): boolean {
  try {
    const testData = new Uint8Array([0x4e, 0x43, 0x54, 0x45, 0x53, 0x54]); // "NCTEST"
    const encrypted = encryptPayload(testData);
    // Decrypt using the same key to verify round-trip
    const nonce = encrypted.slice(0, 12);
    const tag = encrypted.slice(encrypted.length - 16);
    const ciphertext = encrypted.slice(12, encrypted.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", KEY, nonce);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.length === testData.length && 
           decrypted.every((b: number, i: number) => b === testData[i]);
  } catch {
    return false;
  }
}

/** Get a hex fingerprint of the active AES key (first 8 bytes) for sync verification */
export function getKeyFingerprint(): string {
  return KEY.slice(0, 8).toString("hex");
}