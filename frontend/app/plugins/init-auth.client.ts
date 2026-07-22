import { setupAutoRefresh, shouldRefreshToken } from "~/composables/use-auth-refresh";

export default defineNuxtPlugin({
  async setup() {
    const auth = useAuthBackend();

    console.debug("Initializing auth plugin");
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
