// In production (same domain), use relative URLs
// In development, use localhost:4000
const isProduction = import.meta.env.PROD;
const defaultBackendUrl = isProduction ? '' : 'http://localhost:4000';
const defaultWsUrl = isProduction ? window.location.origin : 'http://localhost:4000';

export const env = {
  backendUrl: (import.meta.env.VITE_BACKEND_URL as string) ?? defaultBackendUrl,
  wsUrl: (import.meta.env.VITE_WS_URL as string) ?? defaultWsUrl
};
