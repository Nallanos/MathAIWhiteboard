import type { SubscriptionPlan as StripePlan, SubscriptionState as StripeSubState } from './stripe.js';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  locale: 'fr' | 'en';
}

// Re-export from stripe.ts for backward compatibility
export type { SubscriptionPlan, SubscriptionState } from './stripe.js';
