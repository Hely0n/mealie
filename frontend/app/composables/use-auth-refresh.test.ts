import { describe, expect, test, vi, afterEach } from "vitest";
import { getTokenExpiry, shouldRefreshToken, setupAutoRefresh } from "./use-auth-refresh";

const HOUR_MS = 60 * 60 * 1000;
const TOKEN_TIME_HOURS = 48;

function makeToken(payload: Record<string, unknown>): string {
  const b64url = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.signature`;
}

describe("getTokenExpiry", () => {
  test("returns exp claim in milliseconds", () => {
    const expSeconds = 1_700_000_000;
    expect(getTokenExpiry(makeToken({ sub: "user", exp: expSeconds }))).toBe(expSeconds * 1000);
  });

  test("returns null for a malformed token", () => {
    expect(getTokenExpiry("not-a-jwt")).toBeNull();
    expect(getTokenExpiry("a.%%%.c")).toBeNull();
    expect(getTokenExpiry(null)).toBeNull();
    expect(getTokenExpiry(undefined)).toBeNull();
  });

  test("returns null when the payload has no exp claim", () => {
    expect(getTokenExpiry(makeToken({ sub: "user" }))).toBeNull();
  });
});

describe("shouldRefreshToken", () => {
  const now = 1_700_000_000_000;

  test("returns false for a freshly issued token", () => {
    const token = makeToken({ exp: (now + TOKEN_TIME_HOURS * HOUR_MS) / 1000 });
    expect(shouldRefreshToken(token, TOKEN_TIME_HOURS, now)).toBe(false);
  });

  test("returns true once less than half the token lifetime remains", () => {
    const token = makeToken({ exp: (now + 23 * HOUR_MS) / 1000 });
    expect(shouldRefreshToken(token, TOKEN_TIME_HOURS, now)).toBe(true);
  });

  test("returns false for an expired token (refresh would 401)", () => {
    const token = makeToken({ exp: (now - HOUR_MS) / 1000 });
    expect(shouldRefreshToken(token, TOKEN_TIME_HOURS, now)).toBe(false);
  });

  test("returns false for a token without a readable expiry", () => {
    expect(shouldRefreshToken("garbage", TOKEN_TIME_HOURS, now)).toBe(false);
    expect(shouldRefreshToken(null, TOKEN_TIME_HOURS, now)).toBe(false);
  });
});

describe("setupAutoRefresh", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("refreshes immediately when the token already needs it", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const cleanup = setupAutoRefresh({ shouldRefresh: () => true, refresh });

    expect(refresh).toHaveBeenCalledTimes(1);
    cleanup();
  });

  test("does not refresh when the token is still fresh", () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const cleanup = setupAutoRefresh({ shouldRefresh: () => false, refresh });

    expect(refresh).not.toHaveBeenCalled();
    cleanup();
  });

  test("re-checks on an interval while the app stays open", () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    let due = false;
    const cleanup = setupAutoRefresh({ shouldRefresh: () => due, refresh, intervalMs: 1000 });

    expect(refresh).not.toHaveBeenCalled();
    due = true;
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
    cleanup();
  });

  test("re-checks when the tab becomes visible again", () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    let due = false;
    const cleanup = setupAutoRefresh({ shouldRefresh: () => due, refresh });

    due = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);
    cleanup();
  });

  test("stops checking after cleanup", () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const cleanup = setupAutoRefresh({ shouldRefresh: () => true, refresh, intervalMs: 1000 });
    expect(refresh).toHaveBeenCalledTimes(1);

    cleanup();
    vi.advanceTimersByTime(5000);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("swallows refresh failures so they do not become unhandled rejections", async () => {
    const refresh = vi.fn().mockRejectedValue(new Error("network down"));
    const cleanup = setupAutoRefresh({ shouldRefresh: () => true, refresh });

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    cleanup();
  });

  test("does not start a second refresh while one is in flight", async () => {
    let resolveRefresh: () => void;
    const refresh = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    }));
    vi.useFakeTimers();
    const cleanup = setupAutoRefresh({ shouldRefresh: () => true, refresh, intervalMs: 1000 });
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3000);
    expect(refresh).toHaveBeenCalledTimes(1);

    resolveRefresh!();
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
    cleanup();
  });
});
