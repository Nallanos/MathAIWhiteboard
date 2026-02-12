/**
 * Stripe Types & Configuration
 * 
 * Shared types for Stripe integration between frontend and backend.
 */

// ============================================
// ENUMS
// ============================================

export type SubscriptionPlan = 'free' | 'pro';

export type SubscriptionStatus = 
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

export type CreditTransactionType =
  | 'daily_reset'
  | 'subscription'
  | 'topup'
  | 'consumption'
  | 'refund'
  | 'admin_adjustment'
  | 'chargeback';

// ============================================
// PLAN CONFIGURATION
// ============================================

export interface PlanFeatures {
  aiCreditsPerDay: number;
  aiCreditsPerMonth: number;
  maxBoards: number;
  maxCollaborators: number;
  prioritySupport: boolean;
  advancedAIModels: boolean;
  exportToPdf: boolean;
  customBranding: boolean;
}

export interface PlanConfig {
  plan: SubscriptionPlan;
  name: string;
  priceMonthly: number; // in cents
  priceYearly: number;  // in cents
  features: PlanFeatures;
}

export const PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
  free: {
    plan: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceYearly: 0,
    features: {
      aiCreditsPerDay: 5,
      aiCreditsPerMonth: 0,
      maxBoards: 3,
      maxCollaborators: 1,
      prioritySupport: false,
      advancedAIModels: false,
      exportToPdf: false,
      customBranding: false
    }
  },
  pro: {
    plan: 'pro',
    name: 'Pro',
    priceMonthly: 300, // 3€
    priceYearly: 3000, // 30€ (approx 2 months free)
    features: {
      aiCreditsPerDay: 0, // No daily limit
      aiCreditsPerMonth: 500,
      maxBoards: -1, // Unlimited
      maxCollaborators: 10,
      prioritySupport: true,
      advancedAIModels: true,
      exportToPdf: true,
      customBranding: false
    }
  }
};

// ============================================
// TOP-UP PACKAGES
// ============================================

export interface TopUpPackage {
  id: string;
  name: string;
  credits: number;
  priceInCents: number;
  currency: string;
  stripePriceId: string;
}

// ============================================
// API RESPONSES
// ============================================

export interface SubscriptionState {
  plan: SubscriptionPlan;
  status: SubscriptionStatus | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  features: PlanFeatures;
}

export interface CreditsState {
  available: number;
  resetAt: string | null;  // For daily credits (free plan)
  plan: SubscriptionPlan;
}

export interface CheckoutSessionRequest {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  mode: 'subscription' | 'payment'; // subscription for Pro, payment for top-up
}

export interface CheckoutSessionResponse {
  sessionId: string;
  url: string;
}

export interface PortalSessionResponse {
  url: string;
}

// ============================================
// WEBHOOK EVENTS
// ============================================

export type StripeWebhookEventType =
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'charge.refunded'
  | 'charge.dispute.created'
  | 'charge.dispute.closed';

// ============================================
// FEATURE GATING
// ============================================

export interface FeatureAccess {
  hasAccess: boolean;
  reason?: 'no_credits' | 'plan_limit' | 'subscription_inactive';
  upgradeRequired?: boolean;
}

/**
 * Check if a user can access a specific feature based on their subscription
 */
export function canAccessFeature(
  feature: keyof PlanFeatures,
  subscription: SubscriptionState,
  credits: CreditsState
): FeatureAccess {
  const config = PLAN_CONFIGS[subscription.plan];
  
  // Check subscription status
  const activeStatuses: SubscriptionStatus[] = ['active', 'trialing'];
  if (subscription.status && !activeStatuses.includes(subscription.status)) {
    // past_due: limited access during grace period (7 days)
    if (subscription.status !== 'past_due') {
      return { 
        hasAccess: false, 
        reason: 'subscription_inactive',
        upgradeRequired: true 
      };
    }
  }
  
  // Check specific feature
  const featureValue = config.features[feature];
  
  if (typeof featureValue === 'boolean') {
    return { 
      hasAccess: featureValue,
      upgradeRequired: !featureValue
    };
  }
  
  if (typeof featureValue === 'number') {
    if (featureValue === -1) {
      return { hasAccess: true }; // Unlimited
    }
    // For AI features, also check credits
    if (feature === 'aiCreditsPerDay' || feature === 'aiCreditsPerMonth') {
      if (credits.available <= 0) {
        return {
          hasAccess: false,
          reason: 'no_credits',
          upgradeRequired: subscription.plan === 'free'
        };
      }
    }
    return { hasAccess: true };
  }
  
  return { hasAccess: true };
}

// ============================================
// CREDIT TRANSACTION METADATA
// ============================================

export interface CreditConsumptionMetadata {
  model: string;
  tokens?: number;
  operation: string;
  boardId?: string;
}

export interface CreditTransactionRecord {
  id: string;
  userId: string;
  type: CreditTransactionType;
  amount: number;
  balanceAfter: number;
  reason: string | null;
  metadata: CreditConsumptionMetadata | null;
  stripePaymentIntentId: string | null;
  stripeInvoiceId: string | null;
  createdAt: string;
}
