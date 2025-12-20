// In production (same domain), use relative URLs
// In development, use localhost:4000
const isProduction = import.meta.env.PROD;
const defaultBackendUrl = isProduction ? '' : 'http://localhost:4000';
const defaultWsUrl = isProduction ? window.location.origin : 'http://localhost:4000';

export const env = {
  backendUrl: (import.meta.env.VITE_BACKEND_URL as string) ?? defaultBackendUrl,
  wsUrl: (import.meta.env.VITE_WS_URL as string) ?? defaultWsUrl,
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
  discordUrl: import.meta.env.VITE_DISCORD_URL as string | undefined,
  posthogEnabled:
    (import.meta.env.VITE_POSTHOG_ENABLED as string | undefined) === 'true',
  posthogKey: import.meta.env.VITE_POSTHOG_KEY as string | undefined,
  posthogHost: import.meta.env.VITE_POSTHOG_HOST as string | undefined,
};
