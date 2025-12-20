import posthog from 'posthog-js';

import { env } from './env';

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

let initialized = false;
let lastPageviewUrl: string | null = null;

export function initPostHog() {
  if (initialized) return;
  initialized = true;

  if (!isBrowser()) return;
  if (!env.posthogEnabled) return;
  if (!env.posthogKey) return;

  posthog.init(env.posthogKey, {
    api_host: env.posthogHost || 'https://app.posthog.com',
    capture_pageview: false,
  });
}

export function capturePageview(url?: string) {
  if (!env.posthogEnabled) return;
  if (!env.posthogKey) return;

  const currentUrl = url ?? (isBrowser() ? window.location.href : undefined);
  if (currentUrl && currentUrl === lastPageviewUrl) return;
  lastPageviewUrl = currentUrl ?? null;

  try {
    posthog.capture('$pageview', currentUrl ? { $current_url: currentUrl } : undefined);
  } catch {
    // ignore
  }
}

export function identifyUser(user: { id: string; email?: string; displayName?: string }) {
  if (!env.posthogEnabled) return;
  if (!env.posthogKey) return;

  try {
    posthog.identify(user.id, {
      email: user.email,
      displayName: user.displayName,
    });
  } catch {
    // ignore
  }
}

export function resetPostHog() {
  if (!env.posthogEnabled) return;
  if (!env.posthogKey) return;

  try {
    posthog.reset();
  } catch {
    // ignore
  }
}
