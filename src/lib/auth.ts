import { randomUUID, timingSafeEqual } from "crypto";

/**
 * Generate a new random access token.
 */
export function generateToken(): string {
  return randomUUID();
}

/**
 * Read the configured token from the environment.
 * Returns null if no token is configured (auth disabled).
 */
export function getToken(): string | null {
  const token = process.env.DEVDECK_TOKEN;
  if (!token || token.trim() === "") return null;
  return token;
}

/**
 * Constant-time token comparison using crypto.timingSafeEqual.
 * Returns true if auth is disabled (no expected token).
 * Returns false if no token is provided but auth is required.
 */
export function validateToken(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!expected) return true;
  if (!provided) return false;

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Edge-runtime-compatible constant-time string comparison.
 * Does not require Node.js crypto module.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Parse the devdeck_token value from a Cookie header string.
 */
export function parseCookieToken(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)devdeck_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}
