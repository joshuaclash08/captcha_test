/**
 * ══════════════════════════════════════════════════════════════
 * Site Registry & Key Management (JSON Storage)
 * ══════════════════════════════════════════════════════════════
 * 
 * Production-ready site key / secret key system similar to:
 * - Google reCAPTCHA (site key + secret key)
 * - Cloudflare Turnstile (sitekey + secret key)
 * - hCaptcha (sitekey + secret)
 * 
 * Storage: JSON file (can be migrated to Redis/DB later)
 */

import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { isAbsolute, join, dirname } from "path";
import { ENV } from "./env";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export interface SiteConfig {
  /** Public site key (used in frontend) */
  siteKey: string;
  /** Private secret key (used for server-side validation) */
  secretKey: string;
  /** Allowed domains (with or without wildcards) */
  domains: string[];
  /** Site name/label for identification */
  name: string;
  /** Per-site settings */
  settings: {
    /** Rate limit for challenges per minute (0 = use global) */
    rateLimitChallenge: number;
    /** Rate limit for verifications per minute (0 = use global) */
    rateLimitVerify: number;
    /** Whether to allow localhost (for development) */
    allowLocalhost: boolean;
    /** Maximum token validity in seconds (0 = use global) */
    tokenExpirySeconds: number;
  };
  /** Creation timestamp */
  createdAt: number;
  /** Is site active? */
  active: boolean;
}

export interface SiteValidationResult {
  valid: boolean;
  site?: SiteConfig;
  error?: string;
}

interface SitesData {
  version: number;
  sites: SiteConfig[];
}

// ══════════════════════════════════════════════════════════════
// JSON Storage
// ══════════════════════════════════════════════════════════════

const SERVER_ROOT_DIR = join(import.meta.dir, "..");
const DEFAULT_SITES_FILE = join(SERVER_ROOT_DIR, "data", "sites.json");
const SITES_FILE = (() => {
  const configuredPath = ENV.SITE_REGISTRY_PATH?.trim();
  if (!configuredPath) return DEFAULT_SITES_FILE;
  return isAbsolute(configuredPath)
    ? configuredPath
    : join(SERVER_ROOT_DIR, configuredPath);
})();
const DATA_DIR = dirname(SITES_FILE);

// In-memory cache (synced with JSON file)
let sitesCache: Map<string, SiteConfig> = new Map();
let secretKeyIndex: Map<string, string> = new Map(); // secretKey -> siteKey

function normalizeOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const parsed = new URL(origin);
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
    console.log(`📁 Created data directory: ${DATA_DIR}`);
  }
}

/**
 * Load sites from JSON file
 */
function loadFromFile(): void {
  ensureDataDir();
  
  if (!existsSync(SITES_FILE)) {
    // Create empty sites file
    const initial: SitesData = { version: 1, sites: [] };
    writeFileSync(SITES_FILE, JSON.stringify(initial, null, 2));
    console.log(`📄 Created sites file: ${SITES_FILE}`);
    return;
  }
  
  try {
    const raw = readFileSync(SITES_FILE, "utf-8");
    const data: SitesData = JSON.parse(raw);
    
    sitesCache.clear();
    secretKeyIndex.clear();
    
    for (const site of data.sites) {
      sitesCache.set(site.siteKey, site);
      secretKeyIndex.set(site.secretKey, site.siteKey);
    }
    
    console.log(`📋 Loaded ${data.sites.length} site(s) from ${SITES_FILE}`);
  } catch (err) {
    console.error(`❌ Failed to load sites file:`, err);
  }
}

/**
 * Save sites to JSON file
 */
function saveToFile(): void {
  ensureDataDir();
  
  const data: SitesData = {
    version: 1,
    sites: Array.from(sitesCache.values()),
  };
  
  writeFileSync(SITES_FILE, JSON.stringify(data, null, 2));
}

// ══════════════════════════════════════════════════════════════
// Site Management
// ══════════════════════════════════════════════════════════════

/**
 * Generate a new site key pair
 */
export function generateKeyPair(): { siteKey: string; secretKey: string } {
  const siteKeyBytes = randomBytes(16);
  const secretKeyBytes = randomBytes(32);
  
  return {
    siteKey: `nc_pk_${siteKeyBytes.toString("hex")}`,
    secretKey: `nc_sk_${secretKeyBytes.toString("hex")}`,
  };
}

/**
 * Register a new site (auto-saves to JSON)
 */
export function registerSite(
  name: string,
  domains: string[],
  settings?: Partial<SiteConfig["settings"]>
): SiteConfig {
  const { siteKey, secretKey } = generateKeyPair();
  
  const site: SiteConfig = {
    siteKey,
    secretKey,
    domains: domains.map(d => d.toLowerCase()),
    name,
    settings: {
      rateLimitChallenge: settings?.rateLimitChallenge ?? 0,
      rateLimitVerify: settings?.rateLimitVerify ?? 0,
      allowLocalhost: settings?.allowLocalhost ?? false,
      tokenExpirySeconds: settings?.tokenExpirySeconds ?? 0,
    },
    createdAt: Date.now(),
    active: true,
  };
  
  sitesCache.set(siteKey, site);
  secretKeyIndex.set(secretKey, siteKey);
  saveToFile();
  
  return site;
}

/**
 * Get site by site key (public key)
 */
export function getSiteBySiteKey(siteKey: string): SiteConfig | undefined {
  return sitesCache.get(siteKey);
}

/**
 * Get site by secret key (private key)
 */
export function getSiteBySecretKey(secretKey: string): SiteConfig | undefined {
  const siteKey = secretKeyIndex.get(secretKey);
  if (!siteKey) return undefined;
  return sitesCache.get(siteKey);
}

/**
 * Validate that an origin is allowed for a site
 */
export function isOriginAllowedForSite(site: SiteConfig, origin: string | null): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;
  
  // Parse origin
  let hostname: string;
  let protocol: string;
  try {
    const url = new URL(normalizedOrigin);
    hostname = url.hostname.toLowerCase();
    protocol = url.protocol;
  } catch {
    return false;
  }

  // In production require HTTPS for non-localhost origins.
  if (ENV.IS_PRODUCTION && protocol !== "https:" && hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") {
    return false;
  }
  
  // Check localhost
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return site.settings.allowLocalhost;
  }
  
  // Check against allowed domains
  for (const domain of site.domains) {
    // Exact match
    if (hostname === domain) return true;
    
    // Wildcard subdomain match (*.example.com)
    if (domain.startsWith("*.")) {
      const baseDomain = domain.slice(2);
      if (hostname === baseDomain || hostname.endsWith(`.${baseDomain}`)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Validate site key and origin
 */
export function validateSiteKey(siteKey: string, origin: string | null): SiteValidationResult {
  if (!siteKey) {
    return { valid: false, error: "Missing site key" };
  }
  
  const site = getSiteBySiteKey(siteKey);
  if (!site) {
    return { valid: false, error: "Invalid site key" };
  }
  
  if (!site.active) {
    return { valid: false, error: "Site is disabled" };
  }
  
  if (!isOriginAllowedForSite(site, origin)) {
    return { valid: false, error: "Origin not allowed for this site key" };
  }
  
  return { valid: true, site };
}

/**
 * Validate secret key
 */
export function validateSecretKey(secretKey: string): SiteValidationResult {
  if (!secretKey) {
    return { valid: false, error: "Missing secret key" };
  }
  
  const site = getSiteBySecretKey(secretKey);
  if (!site) {
    return { valid: false, error: "Invalid secret key" };
  }
  
  if (!site.active) {
    return { valid: false, error: "Site is disabled" };
  }
  
  return { valid: true, site };
}

// ══════════════════════════════════════════════════════════════
// Initialization
// ══════════════════════════════════════════════════════════════

/**
 * Initialize site registry (load from JSON)
 */
export function initializeSiteRegistry(): void {
  loadFromFile();
  
  // If no sites exist and we're in development, create a demo site
  if (sitesCache.size === 0 && ENV.DEBUG_MODE) {
    console.log("📋 No sites found, creating demo site for development...");
    const demoSite = registerSite(
      "Demo Site (localhost)",
      ["localhost", "127.0.0.1"],
      { allowLocalhost: true }
    );
    console.log(`   Site Key: ${demoSite.siteKey}`);
    console.log(`   Secret Key: ${demoSite.secretKey}`);
    console.log(`   ⚠️  Save these keys! They won't be shown again.`);
  }
}

/**
 * Get all registered sites (for admin API)
 */
export function getAllSites(): SiteConfig[] {
  return Array.from(sitesCache.values());
}

/**
 * Deactivate a site (auto-saves to JSON)
 */
export function deactivateSite(siteKey: string): boolean {
  const site = sitesCache.get(siteKey);
  if (!site) return false;
  site.active = false;
  saveToFile();
  return true;
}

/**
 * Activate a site (auto-saves to JSON)
 */
export function activateSite(siteKey: string): boolean {
  const site = sitesCache.get(siteKey);
  if (!site) return false;
  site.active = true;
  saveToFile();
  return true;
}

/**
 * Update site domains (auto-saves to JSON)
 */
export function updateSiteDomains(siteKey: string, domains: string[]): boolean {
  const site = sitesCache.get(siteKey);
  if (!site) return false;
  site.domains = domains.map(d => d.toLowerCase());
  saveToFile();
  return true;
}

/**
 * Delete a site (auto-saves to JSON)
 */
export function deleteSite(siteKey: string): boolean {
  const site = sitesCache.get(siteKey);
  if (!site) return false;
  secretKeyIndex.delete(site.secretKey);
  sitesCache.delete(siteKey);
  saveToFile();
  return true;
}

// ══════════════════════════════════════════════════════════════
// Challenge Origin Binding
// ══════════════════════════════════════════════════════════════

