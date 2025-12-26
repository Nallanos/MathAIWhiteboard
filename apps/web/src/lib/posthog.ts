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
    ui_host: env.posthogUiHost,
    // `defaults` is documented as a string (e.g. '2025-11-30') but the SDK typings
    // may lag behind; keep it optional and cast to avoid typecheck failures.
    defaults: env.posthogDefaults as unknown as any,
    capture_pageview: false,
    opt_out_capturing_by_default: env.posthogOptOutByDefault,
  });
}

export function optOutPostHog() {
  if (!env.posthogEnabled) return;
  if (!env.posthogKey) return;

  try {
    posthog.opt_out_capturing();
  } catch {
    // ignore
  }
}

export function optInPostHog() {
  if (!env.posthogEnabled) return;
  if (!env.posthogKey) return;

  try {
    posthog.opt_in_capturing();
  } catch {
    // ignore
  }
}

export function hasOptedOutPostHog() {
  if (!env.posthogEnabled) return false;
  if (!env.posthogKey) return false;

  try {
    return posthog.has_opted_out_capturing();
  } catch {
    return false;
  }
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
