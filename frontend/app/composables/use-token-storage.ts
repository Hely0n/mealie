import { getTokenExpiry } from "~/composables/use-auth-refresh";

/**
 * localStorage backup for the auth token cookie. Safari — especially in
 * home-screen PWAs — caps script-set cookies at 7 days and evicts them
 * aggressively, while localStorage persists reliably. Keeping a copy lets
 * the app restore the session when the cookie has been evicted even though
 * the token itself is still valid.
 */
export function persistToken(key: string, token: string | null | undefined): void {
  try {
    if (token) {
      localStorage.setItem(key, token);
    }
    else {
      localStorage.removeItem(key);
    }
  }
  catch {
    // storage may be unavailable (private mode, quota); the cookie still works
  }
}

/**
 * Returns the stored token if it has a readable, unexpired exp claim;
 * otherwise clears the stored value and returns null.
 */
export function restoreToken(key: string, nowMs: number): string | null {
  try {
    const token = localStorage.getItem(key);
    if (!token) {
      return null;
    }

    const expiry = getTokenExpiry(token);
    if (expiry === null || expiry <= nowMs) {
      localStorage.removeItem(key);
      return null;
    }

    return token;
  }
  catch {
    return null;
  }
}

export function clearPersistedToken(key: string): void {
  persistToken(key, null);
}
