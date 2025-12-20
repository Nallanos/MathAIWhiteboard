import { PostHog } from 'posthog-node';

function isEnabled() {
  return process.env.POSTHOG_ENABLED === 'true' && !!process.env.POSTHOG_PROJECT_API_KEY;
}

let client: PostHog | null = null;

function getClient() {
  if (!isEnabled()) return null;
  if (client) return client;

  const host = process.env.POSTHOG_HOST || 'https://app.posthog.com';
  client = new PostHog(process.env.POSTHOG_PROJECT_API_KEY as string, { host });
  return client;
}

export function captureServerEvent(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
) {
  const posthog = getClient();
  if (!posthog) return;

  try {
    posthog.capture({
      distinctId,
      event,
      properties,
    });
  } catch {
    // ignore
  }
}

export async function shutdownPostHog() {
  const posthog = client;
  client = null;
  if (!posthog) return;

  try {
    await posthog.shutdown();
  } catch {
    // ignore
  }
}
