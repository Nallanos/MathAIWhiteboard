import { env } from './env';

type LogoutFn = () => void;

let logoutCallback: LogoutFn | null = null;

export function setLogoutCallback(fn: LogoutFn) {
  logoutCallback = fn;
}

export async function apiFetch(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<Response> {
  const { token, headers, ...rest } = options;

  const response = await fetch(`${env.backendUrl}${path}`, {
    ...rest,
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (response.status === 401) {
    // Clear auth and redirect to login
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    
    if (logoutCallback) {
      logoutCallback();
    }
    
    // Force redirect if not already on auth page
    if (window.location.pathname !== '/') {
      window.location.href = '/';
    }
  }

  return response;
}
