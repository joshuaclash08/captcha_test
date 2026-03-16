use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};

/// Development fallback values.
/// In production, these should be overridden at compile time with:
/// - AES_KEY_SEED_HEX
/// - AES_KEY_MASK_HEX
const DEFAULT_KEY_SEED: [u8; 32] = [
    0xA3, 0x7B, 0x12, 0xDE, 0x45, 0x9F, 0x01, 0xC8,
    0x67, 0x3A, 0xEE, 0x54, 0xB1, 0x0D, 0x82, 0xF6,
    0x29, 0x73, 0xC4, 0x5E, 0x90, 0x1A, 0xDB, 0x47,
    0xF8, 0x6C, 0x35, 0xA9, 0x0E, 0xB7, 0x64, 0x21,
];

const DEFAULT_KEY_MASK: [u8; 32] = [
    0xF1, 0x2C, 0x59, 0x8A, 0x03, 0xD7, 0x6E, 0xB5,
    0x34, 0x48, 0xAD, 0x16, 0xE3, 0x5F, 0xC0, 0x92,
    0x7D, 0x31, 0x86, 0x0B, 0xF4, 0x6A, 0x99, 0x05,
    0xBA, 0x2E, 0x77, 0xE1, 0x4C, 0xD5, 0x28, 0x63,
];

const KEY_SEED_HEX: &str = match option_env!("AES_KEY_SEED_HEX") {
    Some(v) => v,
    None => "",
};

const KEY_MASK_HEX: &str = match option_env!("AES_KEY_MASK_HEX") {
    Some(v) => v,
    None => "",
};

const KEY_SEED_PREV_HEX: &str = match option_env!("AES_KEY_SEED_PREV_HEX") {
    Some(v) => v,
    None => "",
};

const KEY_MASK_PREV_HEX: &str = match option_env!("AES_KEY_MASK_PREV_HEX") {
    Some(v) => v,
    None => "",
};

fn from_hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn parse_hex_32(input: &str) -> Option<[u8; 32]> {
    if input.len() != 64 {
        return None;
    }

    let mut out = [0u8; 32];
    let bytes = input.as_bytes();
    for i in 0..32 {
        let hi = from_hex_nibble(bytes[i * 2])?;
        let lo = from_hex_nibble(bytes[i * 2 + 1])?;
        out[i] = (hi << 4) | lo;
    }
    Some(out)
}

fn derive_key_from(seed: &[u8; 32], mask: &[u8; 32]) -> [u8; 32] {
    let mut key = [0u8; 32];
    for i in 0..32 {
        key[i] = seed[i] ^ mask[i];
    }
    key
}

/// Derives the active AES-256 key by XORing SEED and MASK.
fn derive_key() -> [u8; 32] {
    let seed = parse_hex_32(KEY_SEED_HEX).unwrap_or(DEFAULT_KEY_SEED);
    let mask = parse_hex_32(KEY_MASK_HEX).unwrap_or(DEFAULT_KEY_MASK);
    derive_key_from(&seed, &mask)
}

/// Optional previous key for rotation window.
fn derive_previous_key() -> Option<[u8; 32]> {
    let seed = parse_hex_32(KEY_SEED_PREV_HEX)?;
    let mask = parse_hex_32(KEY_MASK_PREV_HEX)?;
    Some(derive_key_from(&seed, &mask))
}

/// Decrypt an AES-256-GCM encrypted payload.
/// Format: [nonce: 12 bytes] [ciphertext + auth_tag]
/// AES-GCM appends the 16-byte tag to the ciphertext internally in the `aes-gcm` crate.
pub fn decrypt_payload(encrypted: &[u8]) -> Result<Vec<u8>, String> {
    if encrypted.len() < 12 + 16 {
        return Err("Payload too short (need at least nonce + tag)".into());
    }

    let (nonce_bytes, ciphertext_and_tag) = encrypted.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let active_key = derive_key();
    let active_cipher =
        Aes256Gcm::new_from_slice(&active_key).map_err(|e| format!("Key init error: {}", e))?;

    if let Ok(plain) = active_cipher.decrypt(nonce, ciphertext_and_tag) {
        return Ok(plain);
    }

    if let Some(prev_key) = derive_previous_key() {
        let prev_cipher =
            Aes256Gcm::new_from_slice(&prev_key).map_err(|e| format!("Key init error: {}", e))?;
        if let Ok(plain) = prev_cipher.decrypt(nonce, ciphertext_and_tag) {
            return Ok(plain);
        }
    }

    Err("Decrypt error: auth failed for active/previous keys".into())
}

