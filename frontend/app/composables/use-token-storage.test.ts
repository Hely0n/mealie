import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { persistToken, restoreToken, clearPersistedToken } from "./use-token-storage";

const KEY = "mealie.access_token";
const HOUR_MS = 60 * 60 * 1000;
const now = 1_700_000_000_000;

function makeToken(payload: Record<string, unknown>): string {
  const b64url = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.signature`;
}

describe("token storage fallback", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("persistToken stores the token and restoreToken returns it while valid", () => {
    const token = makeToken({ exp: (now + HOUR_MS) / 1000 });
    persistToken(KEY, token);

    expect(restoreToken(KEY, now)).toBe(token);
  });

  test("restoreToken returns null when nothing is stored", () => {
    expect(restoreToken(KEY, now)).toBeNull();
  });

  test("restoreToken drops an expired token", () => {
    const token = makeToken({ exp: (now - HOUR_MS) / 1000 });
    persistToken(KEY, token);

    expect(restoreToken(KEY, now)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test("restoreToken drops an unreadable token", () => {
    localStorage.setItem(KEY, "garbage");

    expect(restoreToken(KEY, now)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test("persistToken with null clears the stored token", () => {
    persistToken(KEY, makeToken({ exp: (now + HOUR_MS) / 1000 }));
    persistToken(KEY, null);

    expect(restoreToken(KEY, now)).toBeNull();
  });

  test("clearPersistedToken removes the stored token", () => {
    persistToken(KEY, makeToken({ exp: (now + HOUR_MS) / 1000 }));
    clearPersistedToken(KEY);

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test("survives storage errors (e.g. private mode) without throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });

    expect(() => persistToken(KEY, makeToken({ exp: (now + HOUR_MS) / 1000 }))).not.toThrow();
    expect(restoreToken(KEY, now)).toBeNull();
  });
});
