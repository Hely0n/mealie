import { setupAutoRefresh, shouldRefreshToken } from "~/composables/use-auth-refresh";
import { restoreToken } from "~/composables/use-token-storage";

export default defineNuxtPlugin({
  async setup() {
    const auth = useAuthBackend();

    console.debug("Initializing auth plugin");

    if (!auth.token.value) {
      // Safari (PWA) evicts script-set cookies long before the token expires;
      // restore the session from the localStorage backup if it is still valid
      const restored = restoreToken(useRuntimeConfig().public.AUTH_TOKEN, Date.now());
      if (restored) {
        auth.setToken(restored);
      }
    }
    else {
      // re-write the cookie so Safari's 7-day cap on script-set cookies
      // restarts on every visit
      auth.setToken(auth.token.value);
    }

    await auth.getSession();
    console.debug("Auth plugin initialized");

    // Keep active sessions alive: /api/auth/refresh only works while the
    // current token is still valid, so renew it proactively before expiry.
    const { $appInfo } = useNuxtApp();
    setupAutoRefresh({
      shouldRefresh: () => shouldRefreshToken(auth.token.value, $appInfo.tokenTime, Date.now()),
      refresh: () => auth.refresh(),
    });
  },
});
