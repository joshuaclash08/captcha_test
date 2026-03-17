use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};

/// Development fallback values.
/// In production, these should be overridden at compile time with:
/// - AES_KEY_SEED_HEX
/// - AES_KEY_MASK_HEX
// No default key fallbacks allowed. Keys must be injected at build-time.

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
    let seed = parse_hex_32(KEY_SEED_HEX).expect("AES_KEY_SEED is missing or invalid at build time");
    let mask = parse_hex_32(KEY_MASK_HEX).expect("AES_KEY_MASK is missing or invalid at build time");
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

