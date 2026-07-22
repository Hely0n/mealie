const REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Reads the `exp` claim from a Mealie JWT without verifying the signature.
 * Returns the expiry as epoch milliseconds, or null if the token is unreadable.
 */
export function getTokenExpiry(token: string | null | undefined): number | null {
  const payload = token?.split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  }
  catch {
    return null;
  }
}

/**
 * The backend's /api/auth/refresh only works while the current token is still
 * valid, so the token has to be renewed before it expires. Refreshing once
 * less than half the configured lifetime remains keeps active sessions alive
 * without hitting the API on every check.
 */
export function shouldRefreshToken(token: string | null | undefined, tokenTimeHours: number, nowMs: number): boolean {
  const expiry = getTokenExpiry(token);
  if (expiry === null) {
    return false;
  }

  const remainingMs = expiry - nowMs;
  return remainingMs > 0 && remainingMs <= (tokenTimeHours * 60 * 60 * 1000) / 2;
}

interface AutoRefreshOptions {
  shouldRefresh: () => boolean;
  refresh: () => Promise<void>;
  intervalMs?: number;
}

/**
 * Checks immediately, on an interval, and whenever the tab becomes visible
 * whether the token is due for a refresh. Returns a cleanup function.
 */
export function setupAutoRefresh({ shouldRefresh, refresh, intervalMs = REFRESH_CHECK_INTERVAL_MS }: AutoRefreshOptions): () => void {
  let refreshing = false;

  function check() {
    if (refreshing || !shouldRefresh()) {
      return;
    }

    refreshing = true;
    refresh()
      .catch((error) => {
        // auth errors are already handled inside refresh(); a background
        // refresh must never surface as an unhandled rejection
        console.debug("Background token refresh failed:", error);
      })
      .finally(() => {
        refreshing = false;
      });
  }

  const interval = setInterval(check, intervalMs);
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      check();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  check();

  return () => {
    clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
