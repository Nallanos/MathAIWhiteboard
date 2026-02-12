# Plan d'Architecture - Intégration Stripe pour Whiteboard AI

> **Date**: Février 2026  
> **Version**: 2.0  
> **Statut**: Prêt pour implémentation

---

## Table des Matières

1. [Vue d'ensemble de l'architecture](#1-vue-densemble-de-larchitecture)
2. [Modèle de données (Drizzle)](#2-modèle-de-données-drizzle)
3. [Types TypeScript partagés](#3-types-typescript-partagés)
4. [Gestion des Webhooks & Idempotence](#4-gestion-des-webhooks--idempotence)
5. [Système de Crédits & Usage](#5-système-de-crédits--usage)
6. [Middleware de Feature Gating](#6-middleware-de-feature-gating)
7. [Intégration Frontend](#7-intégration-frontend)
8. [Sécurité & Prévention de Fraude](#8-sécurité--prévention-de-fraude)
9. [Observabilité & Analytics](#9-observabilité--analytics)
10. [Guide d'implémentation par étapes](#10-guide-dimplémentation-par-étapes)

---

## 1. Vue d'ensemble de l'architecture

### Schéma des flux

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (apps/web)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ PricingPage  │  │ CheckoutBtn  │  │ PortalBtn    │  │ CreditsCard  │    │
│  │              │  │              │  │              │  │              │    │
│  │ Affiche les  │  │ Démarre      │  │ Ouvre le     │  │ Affiche les  │    │
│  │ plans        │  │ Stripe       │  │ Customer     │  │ crédits IA   │    │
│  │              │  │ Checkout     │  │ Portal       │  │ restants     │    │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘  └──────────────┘    │
│                           │                  │                              │
└───────────────────────────┼──────────────────┼──────────────────────────────┘
                            │                  │
                            ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (apps/backend)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        API ROUTES                                    │   │
│  ├──────────────────┬──────────────────┬──────────────────────────────┤   │
│  │ POST /api/stripe │ POST /api/stripe │ POST /api/stripe/webhook     │   │
│  │ /checkout        │ /portal          │                              │   │
│  │                  │                  │ ┌──────────────────────────┐ │   │
│  │ Crée session     │ Crée session     │ │ Signature Verification   │ │   │
│  │ Stripe Checkout  │ Customer Portal  │ │ Idempotency Check        │ │   │
│  │                  │                  │ │ Event Processing         │ │   │
│  └──────────────────┴──────────────────┴─┴──────────────────────────┴─┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      SERVICES LAYER                                  │   │
│  ├────────────────────────┬────────────────────────────────────────────┤   │
│  │ StripeService          │ CreditsService                             │   │
│  │ - createCheckout()     │ - consumeCredits()                         │   │
│  │ - createPortal()       │ - addCredits()                             │   │
│  │ - handleWebhook()      │ - resetDailyCredits()                      │   │
│  │ - syncSubscription()   │ - getBalance()                             │   │
│  └────────────────────────┴────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      MIDDLEWARE LAYER                                │   │
│  ├────────────────────────┬────────────────────────────────────────────┤   │
│  │ featureGatingMiddleware│ creditsCheckMiddleware                     │   │
│  │ - Vérifie le plan      │ - Vérifie les crédits                      │   │
│  │ - Cache Redis/Memory   │ - Réponse 402 si insuffisant               │   │
│  └────────────────────────┴────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE (PostgreSQL)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌──────────────┐ │
│  │ users          │ │ subscriptions  │ │ credit_txns    │ │ webhook_logs │ │
│  │                │ │                │ │                │ │              │ │
│  │ stripeCustomer │ │ stripeSubId    │ │ userId         │ │ eventId      │ │
│  │ Id             │ │ status         │ │ amount         │ │ processed    │ │
│  │ aiCredits      │ │ plan           │ │ reason         │ │ createdAt    │ │
│  │ planId         │ │ currentPeriod  │ │ stripePayment  │ │              │ │
│  └────────────────┘ └────────────────┘ └────────────────┘ └──────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  STRIPE                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Customers    │  │ Subscriptions│  │ Checkout     │  │ Webhooks     │    │
│  │              │  │              │  │ Sessions     │  │              │    │
│  │ Lié à user   │  │ Free/Pro     │  │ Redirection  │  │ Événements   │    │
│  │ via metadata │  │ Metered?     │  │ sécurisée    │  │ temps réel   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Principes architecturaux

1. **Source de vérité unique** : Stripe est la source de vérité pour l'état des abonnements. La DB locale est un cache synchronisé via webhooks.
2. **Idempotence** : Chaque webhook peut être rejoué sans effet de bord.
3. **Fail-safe** : En cas de doute sur l'état, refuser l'accès plutôt que de l'accorder.
4. **Observabilité** : Tout événement Stripe est loggé pour audit et debug.

---

## 2. Modèle de données (Drizzle)

### Extension du schéma existant

```typescript
// apps/backend/src/db/schema.ts

import { pgTable, uuid, text, timestamp, jsonb, integer, uniqueIndex, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================
// ENUMS
// ============================================

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused'
]);

export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'free',
  'pro'
]);

export const creditTransactionTypeEnum = pgEnum('credit_transaction_type', [
  'daily_reset',      // Crédits quotidiens gratuits
  'subscription',     // Crédits mensuels du plan Pro
  'topup',            // Achat de crédits
  'consumption',      // Utilisation d'un crédit
  'refund',           // Remboursement
  'admin_adjustment', // Ajustement manuel
  'chargeback'        // Répudiation de paiement
]);

// ============================================
// USERS TABLE (Extended)
// ============================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  
  // Stripe Integration
  stripeCustomerId: text('stripe_customer_id').unique(),
  
  // Current subscription state (denormalized for fast access)
  plan: subscriptionPlanEnum('plan').notNull().default('free'),
  subscriptionStatus: subscriptionStatusEnum('subscription_status'),
  
  // Credits system
  aiCredits: integer('ai_credits').notNull().default(5),
  aiCreditsResetAt: timestamp('ai_credits_reset_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
});

// ============================================
// SUBSCRIPTIONS TABLE
// ============================================

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  
  // Stripe IDs
  stripeSubscriptionId: text('stripe_subscription_id').unique().notNull(),
  stripePriceId: text('stripe_price_id').notNull(),
  stripeProductId: text('stripe_product_id'),
  
  // Subscription state
  plan: subscriptionPlanEnum('plan').notNull(),
  status: subscriptionStatusEnum('status').notNull(),
  
  // Billing periods
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  
  // Cancellation info
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  
  // Trial info
  trialStart: timestamp('trial_start', { withTimezone: true }),
  trialEnd: timestamp('trial_end', { withTimezone: true }),
  
  // Metered billing (if applicable)
  meteredUsageReportedAt: timestamp('metered_usage_reported_at', { withTimezone: true }),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
}, (t) => ({
  userIdIdx: uniqueIndex('idx_subscriptions_user_id').on(t.userId)
}));

// ============================================
// CREDIT TRANSACTIONS TABLE
// ============================================

export const creditTransactions = pgTable('credit_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  
  // Transaction details
  type: creditTransactionTypeEnum('type').notNull(),
  amount: integer('amount').notNull(), // Positif = ajout, négatif = retrait
  balanceAfter: integer('balance_after').notNull(),
  
  // Context
  reason: text('reason'), // Description humaine
  metadata: jsonb('metadata'), // Données additionnelles (model, tokens, etc.)
  
  // Stripe references
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeInvoiceId: text('stripe_invoice_id'),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
});

// ============================================
// WEBHOOK EVENTS LOG (Idempotency)
// ============================================

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Stripe event info
  stripeEventId: text('stripe_event_id').unique().notNull(),
  eventType: text('event_type').notNull(),
  
  // Processing state
  processed: boolean('processed').notNull().default(false),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  
  // Error tracking
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').notNull().default(0),
  
  // Raw payload (for debugging/replay)
  payload: jsonb('payload').notNull(),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
});

// ============================================
// TOP-UP PACKAGES (Credit packages for purchase)
// ============================================

export const topupPackages = pgTable('topup_packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Stripe
  stripePriceId: text('stripe_price_id').unique().notNull(),
  stripeProductId: text('stripe_product_id').notNull(),
  
  // Package details
  name: text('name').notNull(),
  credits: integer('credits').notNull(),
  priceInCents: integer('price_in_cents').notNull(),
  currency: text('currency').notNull().default('eur'),
  
  // State
  active: boolean('active').notNull().default(true),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
});
```

### Migration SQL

```sql
-- drizzle/0009_stripe_integration.sql

-- Enums
CREATE TYPE subscription_status AS ENUM (
  'trialing', 'active', 'past_due', 'canceled', 
  'unpaid', 'incomplete', 'incomplete_expired', 'paused'
);

CREATE TYPE subscription_plan AS ENUM ('free', 'pro');

CREATE TYPE credit_transaction_type AS ENUM (
  'daily_reset', 'subscription', 'topup', 
  'consumption', 'refund', 'admin_adjustment', 'chargeback'
);

-- Extend users table
ALTER TABLE users
ADD COLUMN stripe_customer_id TEXT UNIQUE,
ADD COLUMN plan subscription_plan NOT NULL DEFAULT 'free',
ADD COLUMN subscription_status subscription_status,
ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_price_id TEXT NOT NULL,
  stripe_product_id TEXT,
  plan subscription_plan NOT NULL,
  status subscription_status NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  metered_usage_reported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_subscriptions_user_id ON subscriptions(user_id);

-- Credit transactions table
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type credit_transaction_type NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT,
  metadata JSONB,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at);

-- Webhook events table
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);

-- Top-up packages table
CREATE TABLE topup_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_price_id TEXT UNIQUE NOT NULL,
  stripe_product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  credits INTEGER NOT NULL,
  price_in_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 3. Types TypeScript partagés

### Fichier: `packages/shared/src/stripe.ts`

```typescript
// packages/shared/src/stripe.ts

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

export interface PlanConfig {
  plan: SubscriptionPlan;
  name: string;
  priceMonthly: number; // in cents
  priceYearly: number;  // in cents
  features: PlanFeatures;
}

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
    priceMonthly: 1499, // 14.99€
    priceYearly: 14399, // 143.99€ (20% discount)
    features: {
      aiCreditsPerDay: 0, // Pas de limite quotidienne
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

export function canAccessFeature(
  feature: keyof PlanFeatures,
  subscription: SubscriptionState,
  credits: CreditsState
): FeatureAccess {
  const config = PLAN_CONFIGS[subscription.plan];
  
  // Check subscription status
  const activeStatuses: SubscriptionStatus[] = ['active', 'trialing'];
  if (subscription.status && !activeStatuses.includes(subscription.status)) {
    // past_due: accès limité pendant 7 jours (grace period)
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
```

### Export depuis index

```typescript
// packages/shared/src/index.ts
export * from './ai.js';
export * from './board.js';
export * from './user.js';
export * from './stripe.js'; // NEW
```

---

## 4. Gestion des Webhooks & Idempotence

### Architecture du service Stripe

```typescript
// apps/backend/src/services/stripe-service.ts

import Stripe from 'stripe';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { SubscriptionPlan, SubscriptionStatus } from '@mathboard/shared';

interface StripeServiceConfig {
  db: NodePgDatabase<typeof schema>;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  frontendUrl: string;
}

export class StripeService {
  private stripe: Stripe;
  private db: NodePgDatabase<typeof schema>;
  private webhookSecret: string;
  private frontendUrl: string;

  constructor(config: StripeServiceConfig) {
    this.stripe = new Stripe(config.stripeSecretKey, {
      apiVersion: '2024-12-18.acacia'
    });
    this.db = config.db;
    this.webhookSecret = config.stripeWebhookSecret;
    this.frontendUrl = config.frontendUrl;
  }

  // ============================================
  // CUSTOMER MANAGEMENT
  // ============================================

  async getOrCreateCustomer(userId: string, email: string): Promise<string> {
    // Check if user already has a Stripe customer
    const [user] = await this.db
      .select({ stripeCustomerId: schema.users.stripeCustomerId })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (user?.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    // Create new Stripe customer
    const customer = await this.stripe.customers.create({
      email,
      metadata: {
        userId,
        source: 'whiteboard-ai'
      }
    });

    // Save customer ID to database
    await this.db
      .update(schema.users)
      .set({ 
        stripeCustomerId: customer.id,
        updatedAt: new Date()
      })
      .where(eq(schema.users.id, userId));

    return customer.id;
  }

  // ============================================
  // CHECKOUT SESSION
  // ============================================

  async createCheckoutSession(
    userId: string,
    email: string,
    priceId: string,
    mode: 'subscription' | 'payment',
    successUrl: string,
    cancelUrl: string
  ): Promise<{ sessionId: string; url: string }> {
    const customerId = await this.getOrCreateCustomer(userId, email);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        userId,
        priceId
      },
      // Collect billing address for tax compliance
      billing_address_collection: 'required',
      // Enable automatic tax calculation if configured
      automatic_tax: { enabled: true },
      // Allow promotion codes
      allow_promotion_codes: true
    };

    // For subscriptions, add trial if eligible
    if (mode === 'subscription') {
      // Check if user already had a trial
      const existingSubscriptions = await this.db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId));

      if (existingSubscriptions.length === 0) {
        sessionParams.subscription_data = {
          trial_period_days: 7,
          metadata: { userId }
        };
      }
    }

    const session = await this.stripe.checkout.sessions.create(sessionParams);

    return {
      sessionId: session.id,
      url: session.url!
    };
  }

  // ============================================
  // CUSTOMER PORTAL
  // ============================================

  async createPortalSession(userId: string): Promise<{ url: string }> {
    const [user] = await this.db
      .select({ stripeCustomerId: schema.users.stripeCustomerId })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (!user?.stripeCustomerId) {
      throw new Error('No Stripe customer found for this user');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${this.frontendUrl}/settings/billing`
    });

    return { url: session.url };
  }

  // ============================================
  // WEBHOOK HANDLING
  // ============================================

  verifyWebhookSignature(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret
    );
  }

  async handleWebhook(event: Stripe.Event): Promise<void> {
    // 1. Check idempotency - has this event been processed?
    const existingEvent = await this.db
      .select()
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.stripeEventId, event.id));

    if (existingEvent.length > 0 && existingEvent[0].processed) {
      console.log(`[Stripe] Skipping duplicate event: ${event.id}`);
      return;
    }

    // 2. Record event (or update if exists but not processed)
    if (existingEvent.length === 0) {
      await this.db.insert(schema.webhookEvents).values({
        stripeEventId: event.id,
        eventType: event.type,
        payload: event as any,
        processed: false
      });
    }

    try {
      // 3. Process event based on type
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionChange(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.paid':
          await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case 'charge.dispute.created':
          await this.handleChargebackCreated(event.data.object as Stripe.Dispute);
          break;

        default:
          console.log(`[Stripe] Unhandled event type: ${event.type}`);
      }

      // 4. Mark event as processed
      await this.db
        .update(schema.webhookEvents)
        .set({
          processed: true,
          processedAt: new Date()
        })
        .where(eq(schema.webhookEvents.stripeEventId, event.id));

    } catch (error) {
      // 5. Record error for retry/debugging
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await this.db
        .update(schema.webhookEvents)
        .set({
          errorMessage,
          retryCount: (existingEvent[0]?.retryCount ?? 0) + 1
        })
        .where(eq(schema.webhookEvents.stripeEventId, event.id));

      throw error; // Re-throw to return 500 to Stripe for retry
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.userId;
    if (!userId) {
      console.error('[Stripe] Checkout session missing userId metadata');
      return;
    }

    if (session.mode === 'payment') {
      // Top-up purchase - credits will be added via invoice.paid
      console.log(`[Stripe] Top-up checkout completed for user ${userId}`);
    }
    // Subscription is handled by customer.subscription.created
  }

  private async handleSubscriptionChange(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    
    // Find user by Stripe customer ID
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.stripeCustomerId, customerId));

    if (!user) {
      console.error(`[Stripe] No user found for customer ${customerId}`);
      return;
    }

    // Determine plan from price ID
    const priceId = subscription.items.data[0]?.price.id;
    const plan = this.getPlanFromPriceId(priceId);
    const status = subscription.status as SubscriptionStatus;

    // Upsert subscription record
    const subscriptionData = {
      userId: user.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      stripeProductId: subscription.items.data[0]?.price.product as string,
      plan,
      status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at 
        ? new Date(subscription.canceled_at * 1000) 
        : null,
      trialStart: subscription.trial_start 
        ? new Date(subscription.trial_start * 1000) 
        : null,
      trialEnd: subscription.trial_end 
        ? new Date(subscription.trial_end * 1000) 
        : null,
      updatedAt: new Date()
    };

    await this.db
      .insert(schema.subscriptions)
      .values(subscriptionData)
      .onConflictDoUpdate({
        target: schema.subscriptions.stripeSubscriptionId,
        set: subscriptionData
      });

    // Update denormalized user fields
    await this.db
      .update(schema.users)
      .set({
        plan,
        subscriptionStatus: status,
        updatedAt: new Date()
      })
      .where(eq(schema.users.id, user.id));

    console.log(`[Stripe] Subscription ${subscription.id} updated: ${plan}/${status}`);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.stripeCustomerId, customerId));

    if (!user) return;

    // Update subscription record
    await this.db
      .update(schema.subscriptions)
      .set({
        status: 'canceled',
        canceledAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(schema.subscriptions.stripeSubscriptionId, subscription.id));

    // Downgrade user to free plan
    await this.db
      .update(schema.users)
      .set({
        plan: 'free',
        subscriptionStatus: 'canceled',
        updatedAt: new Date()
      })
      .where(eq(schema.users.id, user.id));

    console.log(`[Stripe] User ${user.id} downgraded to free plan`);
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.stripeCustomerId, customerId));

    if (!user) return;

    // Check if this is a top-up payment (not a subscription)
    if (!invoice.subscription) {
      // Find the top-up package from the line items
      for (const lineItem of invoice.lines.data) {
        const priceId = lineItem.price?.id;
        if (priceId) {
          const [topup] = await this.db
            .select()
            .from(schema.topupPackages)
            .where(eq(schema.topupPackages.stripePriceId, priceId));

          if (topup) {
            // Add credits to user
            await this.addCredits(
              user.id,
              topup.credits,
              'topup',
              `Purchased ${topup.name}`,
              invoice.payment_intent as string,
              invoice.id
            );
          }
        }
      }
    } else {
      // Subscription renewal - add monthly credits for Pro
      if (user.plan === 'pro') {
        await this.addCredits(
          user.id,
          500, // Pro monthly credits
          'subscription',
          'Monthly Pro subscription credits',
          null,
          invoice.id
        );
      }
    }
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    
    console.log(`[Stripe] Payment failed for customer ${customerId}, invoice ${invoice.id}`);
    
    // The subscription status will be updated via subscription.updated webhook
    // You could send a notification email here
  }

  private async handleChargebackCreated(dispute: Stripe.Dispute): Promise<void> {
    const chargeId = dispute.charge as string;
    
    // Get the charge to find the customer
    const charge = await this.stripe.charges.retrieve(chargeId);
    const customerId = charge.customer as string;
    
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.stripeCustomerId, customerId));

    if (!user) return;

    // Deduct the disputed credits
    const amountInCredits = Math.ceil(dispute.amount / 100); // Convert cents to credits
    
    await this.addCredits(
      user.id,
      -amountInCredits,
      'chargeback',
      `Chargeback for dispute ${dispute.id}`,
      null,
      null
    );

    console.log(`[Stripe] Chargeback processed for user ${user.id}: -${amountInCredits} credits`);
    
    // Consider: suspend account, send notification, etc.
  }

  // ============================================
  // HELPERS
  // ============================================

  private getPlanFromPriceId(priceId: string): SubscriptionPlan {
    // Map your Stripe price IDs to plans
    const proPriceIds = [
      process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      process.env.STRIPE_PRO_YEARLY_PRICE_ID
    ];
    
    return proPriceIds.includes(priceId) ? 'pro' : 'free';
  }

  private async addCredits(
    userId: string,
    amount: number,
    type: 'daily_reset' | 'subscription' | 'topup' | 'consumption' | 'refund' | 'admin_adjustment' | 'chargeback',
    reason: string,
    stripePaymentIntentId: string | null,
    stripeInvoiceId: string | null
  ): Promise<void> {
    // Atomic credit update with transaction
    await this.db.transaction(async (tx) => {
      // Get current balance
      const [user] = await tx
        .select({ aiCredits: schema.users.aiCredits })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .for('update'); // Lock row

      const newBalance = Math.max(0, (user?.aiCredits ?? 0) + amount);

      // Update user balance
      await tx
        .update(schema.users)
        .set({
          aiCredits: newBalance,
          updatedAt: new Date()
        })
        .where(eq(schema.users.id, userId));

      // Record transaction
      await tx.insert(schema.creditTransactions).values({
        userId,
        type,
        amount,
        balanceAfter: newBalance,
        reason,
        stripePaymentIntentId,
        stripeInvoiceId
      });
    });
  }
}
```

---

## 5. Système de Crédits & Usage

### Service de Crédits

```typescript
// apps/backend/src/services/credits-service.ts

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, sql, and, gte } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { PLAN_CONFIGS } from '@mathboard/shared';

interface CreditsServiceConfig {
  db: NodePgDatabase<typeof schema>;
}

export class InsufficientCreditsError extends Error {
  constructor(message = 'Insufficient AI credits') {
    super(message);
    this.name = 'InsufficientCreditsError';
  }
}

export class CreditsService {
  private db: NodePgDatabase<typeof schema>;

  constructor(config: CreditsServiceConfig) {
    this.db = config.db;
  }

  /**
   * Get user's current credit balance and reset info
   */
  async getBalance(userId: string): Promise<{
    available: number;
    resetAt: Date | null;
    plan: 'free' | 'pro';
  }> {
    const [user] = await this.db
      .select({
        aiCredits: schema.users.aiCredits,
        aiCreditsResetAt: schema.users.aiCreditsResetAt,
        plan: schema.users.plan
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (!user) {
      throw new Error('User not found');
    }

    // Check if daily reset is needed (for free plan)
    if (user.plan === 'free') {
      const now = new Date();
      const resetAt = new Date(user.aiCreditsResetAt);
      const nextReset = new Date(resetAt);
      nextReset.setDate(nextReset.getDate() + 1);

      if (now >= nextReset) {
        // Trigger daily reset
        await this.resetDailyCredits(userId);
        return {
          available: PLAN_CONFIGS.free.features.aiCreditsPerDay,
          resetAt: new Date(now.setDate(now.getDate() + 1)),
          plan: 'free'
        };
      }

      return {
        available: user.aiCredits,
        resetAt: nextReset,
        plan: 'free'
      };
    }

    return {
      available: user.aiCredits,
      resetAt: null,
      plan: user.plan
    };
  }

  /**
   * Consume credits for an AI operation - ATOMIC transaction
   */
  async consumeCredits(
    userId: string,
    amount: number,
    metadata: {
      model: string;
      tokens?: number;
      operation: string;
    }
  ): Promise<{ success: boolean; remaining: number }> {
    return await this.db.transaction(async (tx) => {
      // Lock the user row to prevent race conditions
      const [user] = await tx
        .select({
          aiCredits: schema.users.aiCredits,
          plan: schema.users.plan,
          aiCreditsResetAt: schema.users.aiCreditsResetAt
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .for('update');

      if (!user) {
        throw new Error('User not found');
      }

      // Check for daily reset (free plan only)
      let currentCredits = user.aiCredits;
      if (user.plan === 'free') {
        const now = new Date();
        const resetAt = new Date(user.aiCreditsResetAt);
        const nextReset = new Date(resetAt);
        nextReset.setDate(nextReset.getDate() + 1);

        if (now >= nextReset) {
          currentCredits = PLAN_CONFIGS.free.features.aiCreditsPerDay;
          await tx
            .update(schema.users)
            .set({
              aiCredits: currentCredits,
              aiCreditsResetAt: now,
              updatedAt: now
            })
            .where(eq(schema.users.id, userId));
        }
      }

      // Check if enough credits
      if (currentCredits < amount) {
        throw new InsufficientCreditsError(
          `Not enough credits. Required: ${amount}, Available: ${currentCredits}`
        );
      }

      // Deduct credits
      const newBalance = currentCredits - amount;

      await tx
        .update(schema.users)
        .set({
          aiCredits: newBalance,
          updatedAt: new Date()
        })
        .where(eq(schema.users.id, userId));

      // Record transaction
      await tx.insert(schema.creditTransactions).values({
        userId,
        type: 'consumption',
        amount: -amount,
        balanceAfter: newBalance,
        reason: metadata.operation,
        metadata: metadata as any
      });

      return {
        success: true,
        remaining: newBalance
      };
    });
  }

  /**
   * Reset daily credits for free plan users
   */
  async resetDailyCredits(userId: string): Promise<void> {
    const dailyCredits = PLAN_CONFIGS.free.features.aiCreditsPerDay;
    const now = new Date();

    await this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ aiCredits: schema.users.aiCredits })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .for('update');

      await tx
        .update(schema.users)
        .set({
          aiCredits: dailyCredits,
          aiCreditsResetAt: now,
          updatedAt: now
        })
        .where(eq(schema.users.id, userId));

      await tx.insert(schema.creditTransactions).values({
        userId,
        type: 'daily_reset',
        amount: dailyCredits - (user?.aiCredits ?? 0),
        balanceAfter: dailyCredits,
        reason: 'Daily credits reset'
      });
    });
  }

  /**
   * Add credits (for top-ups, subscriptions, refunds)
   */
  async addCredits(
    userId: string,
    amount: number,
    type: 'subscription' | 'topup' | 'refund' | 'admin_adjustment',
    reason: string,
    stripeRefs?: { paymentIntentId?: string; invoiceId?: string }
  ): Promise<number> {
    return await this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ aiCredits: schema.users.aiCredits })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .for('update');

      const newBalance = (user?.aiCredits ?? 0) + amount;

      await tx
        .update(schema.users)
        .set({
          aiCredits: newBalance,
          updatedAt: new Date()
        })
        .where(eq(schema.users.id, userId));

      await tx.insert(schema.creditTransactions).values({
        userId,
        type,
        amount,
        balanceAfter: newBalance,
        reason,
        stripePaymentIntentId: stripeRefs?.paymentIntentId ?? null,
        stripeInvoiceId: stripeRefs?.invoiceId ?? null
      });

      return newBalance;
    });
  }

  /**
   * Get credit transaction history
   */
  async getTransactionHistory(
    userId: string,
    limit: number = 50
  ): Promise<typeof schema.creditTransactions.$inferSelect[]> {
    return await this.db
      .select()
      .from(schema.creditTransactions)
      .where(eq(schema.creditTransactions.userId, userId))
      .orderBy(sql`created_at DESC`)
      .limit(limit);
  }
}
```

### Metered Billing (Usage Reporting) - Optional

```typescript
// apps/backend/src/services/usage-reporter.ts

import Stripe from 'stripe';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, gte, sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';

interface UsageReporterConfig {
  db: NodePgDatabase<typeof schema>;
  stripe: Stripe;
  reportingIntervalMs: number; // e.g., 60000 for 1 minute
}

/**
 * Usage Reporter for Metered Billing
 * 
 * Reports aggregated usage to Stripe at regular intervals
 * rather than on every API call (improves performance)
 */
export class UsageReporter {
  private db: NodePgDatabase<typeof schema>;
  private stripe: Stripe;
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private pendingUsage: Map<string, number> = new Map(); // userId -> tokenCount

  constructor(config: UsageReporterConfig) {
    this.db = config.db;
    this.stripe = config.stripe;
    this.intervalMs = config.reportingIntervalMs;
  }

  /**
   * Start the usage reporting loop
   */
  start(): void {
    if (this.timer) return;

    this.timer = setInterval(async () => {
      await this.flushPendingUsage();
    }, this.intervalMs);

    console.log(`[UsageReporter] Started with ${this.intervalMs}ms interval`);
  }

  /**
   * Stop the usage reporting loop
   */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Flush any remaining usage
    await this.flushPendingUsage();
    console.log('[UsageReporter] Stopped');
  }

  /**
   * Record usage for later reporting (non-blocking)
   */
  recordUsage(userId: string, tokens: number): void {
    const current = this.pendingUsage.get(userId) ?? 0;
    this.pendingUsage.set(userId, current + tokens);
  }

  /**
   * Flush all pending usage to Stripe
   */
  private async flushPendingUsage(): Promise<void> {
    if (this.pendingUsage.size === 0) return;

    const batch = new Map(this.pendingUsage);
    this.pendingUsage.clear();

    for (const [userId, tokens] of batch) {
      try {
        await this.reportToStripe(userId, tokens);
      } catch (error) {
        console.error(`[UsageReporter] Failed to report for ${userId}:`, error);
        // Re-add to pending for next flush
        const current = this.pendingUsage.get(userId) ?? 0;
        this.pendingUsage.set(userId, current + tokens);
      }
    }
  }

  /**
   * Report usage to Stripe for a user
   */
  private async reportToStripe(userId: string, tokens: number): Promise<void> {
    // Get user's active subscription with metered item
    const [subscription] = await this.db
      .select()
      .from(schema.subscriptions)
      .where(
        sql`${schema.subscriptions.userId} = ${userId}
            AND ${schema.subscriptions.status} IN ('active', 'trialing')`
      );

    if (!subscription) return;

    // Get subscription items from Stripe
    const stripeSubscription = await this.stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
      { expand: ['items.data.price'] }
    );

    // Find the metered price item
    const meteredItem = stripeSubscription.items.data.find(
      (item) => item.price.recurring?.usage_type === 'metered'
    );

    if (!meteredItem) return;

    // Report usage
    await this.stripe.subscriptionItems.createUsageRecord(
      meteredItem.id,
      {
        quantity: tokens,
        timestamp: Math.floor(Date.now() / 1000),
        action: 'increment'
      }
    );

    // Update last reported timestamp
    await this.db
      .update(schema.subscriptions)
      .set({ meteredUsageReportedAt: new Date() })
      .where(eq(schema.subscriptions.id, subscription.id));

    console.log(`[UsageReporter] Reported ${tokens} tokens for user ${userId}`);
  }
}
```

---

## 6. Middleware de Feature Gating

### Cache des droits utilisateur

```typescript
// apps/backend/src/lib/entitlements-cache.ts

import type { SubscriptionPlan, SubscriptionStatus, PlanFeatures } from '@mathboard/shared';
import { PLAN_CONFIGS } from '@mathboard/shared';

interface UserEntitlements {
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus | null;
  aiCredits: number;
  features: PlanFeatures;
  cachedAt: number;
}

/**
 * In-memory cache for user entitlements
 * 
 * For production with multiple instances, replace with Redis:
 * - Key: `entitlements:${userId}`
 * - TTL: 60 seconds
 */
export class EntitlementsCache {
  private cache: Map<string, UserEntitlements> = new Map();
  private readonly ttlMs: number;

  constructor(ttlMs: number = 60_000) { // 1 minute default
    this.ttlMs = ttlMs;
  }

  get(userId: string): UserEntitlements | null {
    const entry = this.cache.get(userId);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.cache.delete(userId);
      return null;
    }
    
    return entry;
  }

  set(data: Omit<UserEntitlements, 'cachedAt'>): void {
    this.cache.set(data.userId, {
      ...data,
      cachedAt: Date.now()
    });
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Invalidate cache when subscription changes (called from webhook handler)
   */
  invalidateAll(): void {
    this.cache.clear();
  }
}

// Singleton instance
export const entitlementsCache = new EntitlementsCache();
```

### Middleware de Feature Gating

```typescript
// apps/backend/src/middleware/feature-gate.ts

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { entitlementsCache } from '../lib/entitlements-cache.js';
import { PLAN_CONFIGS, canAccessFeature, type PlanFeatures } from '@mathboard/shared';
import type { AuthenticatedRequest } from './types.js';

interface FeatureGateConfig {
  db: NodePgDatabase<typeof schema>;
}

/**
 * Creates a feature gating middleware
 */
export function createFeatureGate(config: FeatureGateConfig) {
  const { db } = config;

  /**
   * Load user entitlements (from cache or DB)
   */
  async function loadEntitlements(userId: string) {
    // Check cache first
    let cached = entitlementsCache.get(userId);
    if (cached) return cached;

    // Load from database
    const [user] = await db
      .select({
        id: schema.users.id,
        plan: schema.users.plan,
        subscriptionStatus: schema.users.subscriptionStatus,
        aiCredits: schema.users.aiCredits
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (!user) {
      throw new Error('User not found');
    }

    const entitlements = {
      userId: user.id,
      plan: user.plan,
      status: user.subscriptionStatus,
      aiCredits: user.aiCredits,
      features: PLAN_CONFIGS[user.plan].features
    };

    // Cache for future requests
    entitlementsCache.set(entitlements);

    return entitlements;
  }

  /**
   * Middleware that requires a specific feature
   */
  function requireFeature(feature: keyof PlanFeatures): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
        const entitlements = await loadEntitlements(userId);
        
        const subscription = {
          plan: entitlements.plan,
          status: entitlements.status,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          features: entitlements.features
        };

        const credits = {
          available: entitlements.aiCredits,
          resetAt: null,
          plan: entitlements.plan
        };

        const access = canAccessFeature(feature, subscription, credits);

        if (!access.hasAccess) {
          const statusCode = access.reason === 'no_credits' ? 402 : 403;
          return res.status(statusCode).json({
            error: access.reason,
            upgradeRequired: access.upgradeRequired,
            currentPlan: entitlements.plan
          });
        }

        // Attach entitlements to request for downstream use
        (authReq as any).entitlements = entitlements;
        
        next();
      } catch (error) {
        console.error('[FeatureGate] Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    };
  }

  /**
   * Middleware that requires available AI credits
   */
  function requireCredits(amount: number = 1): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
        const entitlements = await loadEntitlements(userId);

        if (entitlements.aiCredits < amount) {
          return res.status(402).json({
            error: 'insufficient_credits',
            required: amount,
            available: entitlements.aiCredits,
            upgradeRequired: entitlements.plan === 'free'
          });
        }

        (authReq as any).entitlements = entitlements;
        next();
      } catch (error) {
        console.error('[FeatureGate] Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    };
  }

  /**
   * Middleware that loads entitlements without blocking
   */
  function loadEntitlementsMiddleware(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;

      if (userId) {
        try {
          const entitlements = await loadEntitlements(userId);
          (authReq as any).entitlements = entitlements;
        } catch (error) {
          console.error('[FeatureGate] Failed to load entitlements:', error);
        }
      }

      next();
    };
  }

  return {
    requireFeature,
    requireCredits,
    loadEntitlements: loadEntitlementsMiddleware,
    invalidateCache: (userId: string) => entitlementsCache.invalidate(userId)
  };
}
```

### Utilisation dans les routes

```typescript
// apps/backend/src/routes/ai.ts (updated)

import { createFeatureGate } from '../middleware/feature-gate.js';

export function registerAIRoutes({ app, authMiddleware, aiService, db }: Dependencies): void {
  const featureGate = createFeatureGate({ db });

  // Require credits before AI analysis
  app.post(
    '/api/ai/analyze',
    authMiddleware,
    featureGate.requireCredits(1),
    async (req: Request, res: Response) => {
      // ... existing logic
    }
  );

  // Premium models require Pro plan
  app.post(
    '/api/ai/analyze/premium',
    authMiddleware,
    featureGate.requireFeature('advancedAIModels'),
    featureGate.requireCredits(1),
    async (req: Request, res: Response) => {
      // ... premium model logic
    }
  );
}
```

---

## 7. Intégration Frontend

### Routes API Stripe

```typescript
// apps/backend/src/routes/stripe.ts (complete)

import type { Express, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import type { StripeService } from '../services/stripe-service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const checkoutSchema = z.object({
  priceId: z.string(),
  mode: z.enum(['subscription', 'payment']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url()
});

interface Dependencies {
  app: Express;
  authMiddleware: RequestHandler;
  stripeService: StripeService;
}

export function registerStripeRoutes({ app, authMiddleware, stripeService }: Dependencies): void {
  
  // Create Checkout Session
  app.post('/api/stripe/checkout', authMiddleware, async (req: Request, res: Response) => {
    const parsed = checkoutSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.flatten() });
    }

    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;

    try {
      // Get user email (you'll need to fetch this)
      const email = (authReq as any).userEmail || 'user@example.com';
      
      const session = await stripeService.createCheckoutSession(
        userId,
        email,
        parsed.data.priceId,
        parsed.data.mode,
        parsed.data.successUrl,
        parsed.data.cancelUrl
      );

      return res.status(200).json(session);
    } catch (error) {
      console.error('[Stripe] Checkout error:', error);
      return res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  // Create Customer Portal Session
  app.post('/api/stripe/portal', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;

    try {
      const session = await stripeService.createPortalSession(userId);
      return res.status(200).json(session);
    } catch (error) {
      console.error('[Stripe] Portal error:', error);
      return res.status(500).json({ error: 'Failed to create portal session' });
    }
  });

  // Get subscription status
  app.get('/api/stripe/subscription', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;

    try {
      const subscription = await stripeService.getSubscriptionStatus(userId);
      return res.status(200).json(subscription);
    } catch (error) {
      console.error('[Stripe] Subscription fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch subscription' });
    }
  });

  // Webhook endpoint (raw body required for signature verification)
  app.post(
    '/api/stripe/webhook',
    // Use raw body for signature verification
    (req: Request, res: Response, next) => {
      if (req.headers['content-type'] === 'application/json') {
        // Body already parsed by express.json() - this won't work for signature
        // You need to configure express.json() to exclude this route
        // or use express.raw() for this specific endpoint
      }
      next();
    },
    async (req: Request, res: Response) => {
      const signature = req.headers['stripe-signature'] as string;

      if (!signature) {
        return res.status(400).json({ error: 'Missing stripe-signature header' });
      }

      try {
        // Verify and parse the event
        const event = stripeService.verifyWebhookSignature(
          req.body, // Must be raw Buffer
          signature
        );

        // Process the event
        await stripeService.handleWebhook(event);

        return res.status(200).json({ received: true });
      } catch (error) {
        console.error('[Stripe] Webhook error:', error);
        
        if (error instanceof Error && error.message.includes('signature')) {
          return res.status(401).json({ error: 'Invalid signature' });
        }
        
        // Return 500 so Stripe will retry
        return res.status(500).json({ error: 'Webhook processing failed' });
      }
    }
  );
}
```

### Configuration Express pour Webhooks

```typescript
// apps/backend/src/index.ts (partial update)

// Important: Apply JSON parsing AFTER defining raw routes
// Option 1: Exclude webhook route from JSON parsing
app.use((req, res, next) => {
  if (req.path === '/api/stripe/webhook') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

// Apply raw body parser specifically for webhooks
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
```

### Composants Frontend React

```typescript
// apps/web/src/components/stripe/PricingCard.tsx

import { useState } from 'react';
import { PLAN_CONFIGS, type SubscriptionPlan } from '@mathboard/shared';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { trackEvent } from '@/lib/posthog';

interface PricingCardProps {
  plan: SubscriptionPlan;
  isCurrentPlan: boolean;
  billingCycle: 'monthly' | 'yearly';
}

export function PricingCard({ plan, isCurrentPlan, billingCycle }: PricingCardProps) {
  const [loading, setLoading] = useState(false);
  const { isAuthenticated } = useAuth();
  const config = PLAN_CONFIGS[plan];

  const priceId = billingCycle === 'monthly'
    ? import.meta.env.VITE_STRIPE_PRO_MONTHLY_PRICE_ID
    : import.meta.env.VITE_STRIPE_PRO_YEARLY_PRICE_ID;

  const handleSubscribe = async () => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      window.location.href = `/login?returnTo=/pricing`;
      return;
    }

    setLoading(true);
    trackEvent('pricing_cta_clicked', { plan, billingCycle });

    try {
      const response = await api.post<{ url: string }>('/api/stripe/checkout', {
        priceId,
        mode: 'subscription',
        successUrl: `${window.location.origin}/settings/billing?success=true`,
        cancelUrl: `${window.location.origin}/pricing`
      });

      // Redirect to Stripe Checkout
      window.location.href = response.url;
    } catch (error) {
      console.error('Checkout error:', error);
      setLoading(false);
    }
  };

  if (plan === 'free') {
    return (
      <div className="pricing-card">
        <h3>{config.name}</h3>
        <p className="price">Gratuit</p>
        <ul>
          <li>{config.features.aiCreditsPerDay} crédits IA / jour</li>
          <li>{config.features.maxBoards} tableaux max</li>
        </ul>
        {isCurrentPlan && <span className="badge">Plan actuel</span>}
      </div>
    );
  }

  return (
    <div className="pricing-card featured">
      <h3>{config.name}</h3>
      <p className="price">
        {billingCycle === 'monthly'
          ? `${(config.priceMonthly / 100).toFixed(2)}€/mois`
          : `${(config.priceYearly / 100 / 12).toFixed(2)}€/mois`}
      </p>
      {billingCycle === 'yearly' && (
        <span className="discount">2 mois offerts</span>
      )}
      <ul>
        <li>{config.features.aiCreditsPerMonth} crédits IA / mois</li>
        <li>Tableaux illimités</li>
        <li>Modèles IA avancés</li>
        <li>Support prioritaire</li>
      </ul>
      {isCurrentPlan ? (
        <span className="badge">Plan actuel</span>
      ) : (
        <button onClick={handleSubscribe} disabled={loading}>
          {loading ? 'Chargement...' : 'Souscrire'}
        </button>
      )}
    </div>
  );
}
```

```typescript
// apps/web/src/components/stripe/ManageSubscriptionButton.tsx

import { useState } from 'react';
import { api } from '@/lib/api';
import { trackEvent } from '@/lib/posthog';

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);

  const handleManage = async () => {
    setLoading(true);
    trackEvent('billing_portal_clicked');

    try {
      const response = await api.post<{ url: string }>('/api/stripe/portal');
      window.location.href = response.url;
    } catch (error) {
      console.error('Portal error:', error);
      setLoading(false);
    }
  };

  return (
    <button onClick={handleManage} disabled={loading}>
      {loading ? 'Chargement...' : 'Gérer mon abonnement'}
    </button>
  );
}
```

```typescript
// apps/web/src/components/stripe/CreditsDisplay.tsx

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreditsState } from '@mathboard/shared';

export function CreditsDisplay() {
  const { data: credits, isLoading } = useQuery({
    queryKey: ['credits'],
    queryFn: () => api.get<CreditsState>('/api/me/credits'),
    refetchInterval: 30_000 // Refresh every 30s
  });

  if (isLoading || !credits) {
    return <div className="credits-display loading" />;
  }

  const formatResetTime = (resetAt: string | null) => {
    if (!resetAt) return null;
    const date = new Date(resetAt);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="credits-display">
      <span className="credits-count">{credits.available}</span>
      <span className="credits-label">crédits IA</span>
      {credits.resetAt && (
        <span className="credits-reset">
          Reset à {formatResetTime(credits.resetAt)}
        </span>
      )}
    </div>
  );
}
```

### Notification de succès (WebSocket ou Polling)

```typescript
// apps/web/src/hooks/usePaymentSuccess.ts

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { trackEvent } from '@/lib/posthog';
import { api } from '@/lib/api';

export function usePaymentSuccess() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const success = searchParams.get('success');

    if (success === 'true' && sessionId) {
      setStatus('pending');
      
      // Poll for subscription update
      const pollSubscription = async () => {
        const maxAttempts = 10;
        let attempts = 0;

        const check = async () => {
          attempts++;
          try {
            const subscription = await api.get('/api/stripe/subscription');
            
            if (subscription.status === 'active' || subscription.status === 'trialing') {
              setStatus('success');
              trackEvent('checkout_success', { sessionId });
              
              // Invalidate all relevant queries
              queryClient.invalidateQueries({ queryKey: ['subscription'] });
              queryClient.invalidateQueries({ queryKey: ['credits'] });
              queryClient.invalidateQueries({ queryKey: ['me'] });
              
              // Clean URL
              searchParams.delete('session_id');
              searchParams.delete('success');
              setSearchParams(searchParams);
              
              return;
            }
          } catch (error) {
            console.error('Subscription check failed:', error);
          }

          if (attempts < maxAttempts) {
            setTimeout(check, 2000); // Poll every 2s
          } else {
            setStatus('error');
          }
        };

        check();
      };

      pollSubscription();
    }
  }, [searchParams]);

  return { status };
}
```

---

## 8. Sécurité & Prévention de Fraude

### Règles de sécurité

1. **Jamais de mutation de crédits côté client**
   - Les crédits ne sont jamais modifiés via une API publique
   - Seuls les webhooks Stripe peuvent ajouter des crédits

2. **Validation des webhooks**
   ```typescript
   // Toujours vérifier la signature Stripe
   const event = stripe.webhooks.constructEvent(
     payload,
     signature,
     webhookSecret
   );
   ```

3. **Transactions atomiques**
   - Toute modification de crédits utilise `FOR UPDATE` pour verrouiller la ligne
   - Impossible de consommer plus de crédits que disponibles

4. **Idempotence des webhooks**
   - Chaque `event.id` Stripe est enregistré avant traitement
   - Un replay ne produit aucun effet de bord

### Gestion des Chargebacks

```typescript
// Dans StripeService.handleChargebackCreated()

private async handleChargebackCreated(dispute: Stripe.Dispute): Promise<void> {
  const chargeId = dispute.charge as string;
  const charge = await this.stripe.charges.retrieve(chargeId);
  const customerId = charge.customer as string;
  
  const [user] = await this.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.stripeCustomerId, customerId));

  if (!user) return;

  // 1. Révoquer les crédits associés
  const creditsToRevoke = Math.ceil(dispute.amount / 100);
  await this.addCredits(
    user.id,
    -creditsToRevoke,
    'chargeback',
    `Dispute ${dispute.id} - ${dispute.reason}`,
    null,
    null
  );

  // 2. Marquer l'utilisateur comme à risque (optionnel)
  await this.db
    .update(schema.users)
    .set({ 
      flaggedForFraud: true,
      updatedAt: new Date()
    })
    .where(eq(schema.users.id, user.id));

  // 3. Notifier l'équipe (via Slack, email, etc.)
  await notifyTeam({
    type: 'chargeback',
    userId: user.id,
    amount: dispute.amount,
    reason: dispute.reason
  });

  // 4. Optionnel: Suspendre l'accès immédiatement
  // await this.suspendUser(user.id);
}
```

### Validation des Price IDs

```typescript
// Liste blanche des Price IDs autorisés
const ALLOWED_PRICE_IDS = new Set([
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
  process.env.STRIPE_PRO_YEARLY_PRICE_ID,
  process.env.STRIPE_TOPUP_50_PRICE_ID,
  process.env.STRIPE_TOPUP_200_PRICE_ID,
  process.env.STRIPE_TOPUP_500_PRICE_ID
]);

// Dans createCheckoutSession
if (!ALLOWED_PRICE_IDS.has(priceId)) {
  throw new Error('Invalid price ID');
}
```

---

## 9. Observabilité & Analytics

### Plan de tags PostHog

```typescript
// apps/web/src/lib/posthog.ts

import posthog from 'posthog-js';

// Funnel: Pricing → Checkout → Success
export const STRIPE_EVENTS = {
  // Page views
  PRICING_PAGE_VIEWED: 'pricing_page_viewed',
  
  // Interactions
  PLAN_SELECTED: 'plan_selected',
  BILLING_CYCLE_CHANGED: 'billing_cycle_changed',
  CTA_CLICKED: 'checkout_cta_clicked',
  
  // Checkout flow
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_COMPLETED: 'checkout_completed',
  CHECKOUT_ABANDONED: 'checkout_abandoned',
  
  // Portal
  PORTAL_OPENED: 'billing_portal_opened',
  SUBSCRIPTION_MODIFIED: 'subscription_modified',
  
  // Credits
  CREDITS_PURCHASED: 'credits_purchased',
  CREDITS_EXHAUSTED: 'credits_exhausted',
  
  // Errors
  PAYMENT_FAILED: 'payment_failed',
  UPGRADE_BLOCKED: 'upgrade_blocked'
} as const;

export function trackStripeEvent(
  event: keyof typeof STRIPE_EVENTS,
  properties?: Record<string, any>
) {
  posthog.capture(STRIPE_EVENTS[event], {
    ...properties,
    $set: properties?.plan ? { plan: properties.plan } : undefined
  });
}

// Usage examples:
// trackStripeEvent('PRICING_PAGE_VIEWED', { source: 'header' });
// trackStripeEvent('PLAN_SELECTED', { plan: 'pro', billingCycle: 'yearly' });
// trackStripeEvent('CHECKOUT_COMPLETED', { plan: 'pro', amount: 1499 });
```

### Monitoring des webhooks

```typescript
// apps/backend/src/lib/webhook-monitor.ts

interface WebhookMetrics {
  totalReceived: number;
  totalProcessed: number;
  totalFailed: number;
  processingTimeMs: number[];
  lastEventAt: Date | null;
}

class WebhookMonitor {
  private metrics: WebhookMetrics = {
    totalReceived: 0,
    totalProcessed: 0,
    totalFailed: 0,
    processingTimeMs: [],
    lastEventAt: null
  };

  recordReceived(): void {
    this.metrics.totalReceived++;
    this.metrics.lastEventAt = new Date();
  }

  recordProcessed(durationMs: number): void {
    this.metrics.totalProcessed++;
    this.metrics.processingTimeMs.push(durationMs);
    
    // Keep last 100 measurements
    if (this.metrics.processingTimeMs.length > 100) {
      this.metrics.processingTimeMs.shift();
    }
  }

  recordFailed(): void {
    this.metrics.totalFailed++;
  }

  getStats() {
    const times = this.metrics.processingTimeMs;
    const avgProcessingTime = times.length > 0
      ? times.reduce((a, b) => a + b, 0) / times.length
      : 0;

    return {
      ...this.metrics,
      avgProcessingTimeMs: avgProcessingTime,
      successRate: this.metrics.totalReceived > 0
        ? (this.metrics.totalProcessed / this.metrics.totalReceived) * 100
        : 100
    };
  }
}

export const webhookMonitor = new WebhookMonitor();

// Endpoint pour health check
app.get('/api/admin/webhook-health', adminAuthMiddleware, (req, res) => {
  res.json(webhookMonitor.getStats());
});
```

### Alertes (via PostHog ou autre)

```typescript
// apps/backend/src/lib/alerts.ts

interface Alert {
  type: 'webhook_failure' | 'high_chargeback' | 'payment_failed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metadata?: Record<string, any>;
}

export async function sendAlert(alert: Alert): Promise<void> {
  // Option 1: PostHog
  // posthog.capture('system_alert', alert);

  // Option 2: Slack webhook
  if (process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 *${alert.severity.toUpperCase()}*: ${alert.type}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${alert.type}*\n${alert.message}`
            }
          }
        ]
      })
    });
  }

  // Option 3: Log for DataDog/CloudWatch
  console.log(JSON.stringify({
    level: alert.severity === 'critical' ? 'error' : 'warn',
    type: 'alert',
    ...alert
  }));
}
```

---

## 10. Guide d'implémentation par étapes

### Phase 1: Fondations (Semaine 1)

1. **Configuration Stripe**
   - [ ] Créer compte Stripe (test mode)
   - [ ] Configurer les produits et prix (Pro monthly/yearly, Top-ups)
   - [ ] Configurer le Customer Portal
   - [ ] Générer les clés API et webhook secret

2. **Base de données**
   - [ ] Créer la migration `0009_stripe_integration.sql`
   - [ ] Ajouter les nouveaux champs au schéma Drizzle
   - [ ] Exécuter la migration en dev

3. **Package Stripe**
   - [ ] Ajouter `stripe` aux dépendances backend
   - [ ] Créer les types partagés dans `packages/shared`

### Phase 2: Backend Core (Semaine 2)

4. **Services**
   - [ ] Implémenter `StripeService`
   - [ ] Implémenter `CreditsService`
   - [ ] Créer le cache des entitlements

5. **Routes API**
   - [ ] `/api/stripe/checkout` - Création de session
   - [ ] `/api/stripe/portal` - Customer Portal
   - [ ] `/api/stripe/webhook` - Réception des webhooks
   - [ ] `/api/me/credits` - État des crédits

6. **Middleware**
   - [ ] `requireCredits()` middleware
   - [ ] `requireFeature()` middleware
   - [ ] Intégrer dans les routes AI existantes

### Phase 3: Webhooks & Idempotence (Semaine 2-3)

7. **Handlers webhook**
   - [ ] `checkout.session.completed`
   - [ ] `customer.subscription.created/updated/deleted`
   - [ ] `invoice.paid/payment_failed`
   - [ ] `charge.dispute.created`

8. **Tests**
   - [ ] Stripe CLI pour tester les webhooks localement
   - [ ] Tests unitaires des handlers
   - [ ] Tests d'idempotence

### Phase 4: Frontend (Semaine 3)

9. **Pages**
   - [ ] Page Pricing avec toggle monthly/yearly
   - [ ] Page Settings/Billing
   - [ ] Modal d'upgrade quand crédits épuisés

10. **Composants**
    - [ ] `PricingCard`
    - [ ] `CreditsDisplay`
    - [ ] `ManageSubscriptionButton`
    - [ ] `TopUpModal`

11. **Hooks**
    - [ ] `useSubscription()`
    - [ ] `useCredits()`
    - [ ] `usePaymentSuccess()`

### Phase 5: Observabilité (Semaine 4)

12. **Analytics**
    - [ ] Événements PostHog pour le funnel
    - [ ] Dashboard conversion

13. **Monitoring**
    - [ ] Métriques webhooks
    - [ ] Alertes Slack/Email

### Phase 6: Production (Semaine 4)

14. **Déploiement**
    - [ ] Variables d'environnement production
    - [ ] Webhook endpoint public (HTTPS)
    - [ ] Passer Stripe en mode live

15. **Documentation**
    - [ ] Guide utilisateur (centre d'aide)
    - [ ] Runbook opérationnel

---

## Variables d'environnement requises

```bash
# .env.production

# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRO_MONTHLY_PRICE_ID=price_xxx
STRIPE_PRO_YEARLY_PRICE_ID=price_xxx
STRIPE_TOPUP_50_PRICE_ID=price_xxx
STRIPE_TOPUP_200_PRICE_ID=price_xxx
STRIPE_TOPUP_500_PRICE_ID=price_xxx

# Frontend
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
VITE_STRIPE_PRO_MONTHLY_PRICE_ID=price_xxx
VITE_STRIPE_PRO_YEARLY_PRICE_ID=price_xxx
```

---

## Checklist de sécurité finale

- [ ] Signature webhook vérifiée sur chaque requête
- [ ] Body raw utilisé pour la vérification (pas JSON parsé)
- [ ] Idempotence via `webhook_events.stripe_event_id`
- [ ] Transactions atomiques pour les modifications de crédits
- [ ] Liste blanche des Price IDs autorisés
- [ ] Pas d'API publique pour ajouter des crédits
- [ ] Gestion des chargebacks avec révocation de crédits
- [ ] Rate limiting sur les endpoints Stripe
- [ ] Logs d'audit pour toutes les opérations de facturation
