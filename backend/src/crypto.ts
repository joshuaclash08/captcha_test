import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "crypto";
import { ENV } from "./env";

/**
 * AES-256-GCM encryption key.
 * Must match the XOR-derived key in wasm/src/decrypt.rs:
 *   KEY[i] = KEY_SEED[i] ^ KEY_MASK[i]
 * 
 * Production & Development: Must set AES_KEY_SEED and AES_KEY_MASK environment variables
 * No hardcoded defaults are allowed since WASM expects injected keys.
 */

function getKeys(): { seed: Buffer; mask: Buffer } {
  if (!ENV.AES_KEY_SEED || !ENV.AES_KEY_MASK) {
    throw new Error("AES_KEY_SEED and AES_KEY_MASK environment variables are required.");
  }

  return {
    seed: Buffer.from(ENV.AES_KEY_SEED, "hex"),
    mask: Buffer.from(ENV.AES_KEY_MASK, "hex"),
  };
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