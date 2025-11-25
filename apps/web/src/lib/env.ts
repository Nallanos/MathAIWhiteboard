export const env = {
  backendUrl: (import.meta.env.VITE_BACKEND_URL as string) ?? 'http://localhost:4000',
  wsUrl: (import.meta.env.VITE_WS_URL as string) ?? 'http://localhost:4000'
};
