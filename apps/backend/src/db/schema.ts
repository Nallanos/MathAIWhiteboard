import { pgTable, uuid, text, timestamp, jsonb, integer, uniqueIndex, boolean, pgEnum, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================
// ENUMS
// ============================================

export const emailStatusEnum = pgEnum('email_status', [
  'valid',
  'bounced',
  'complained',
  'unsubscribed'
]);

export const oauthProviderEnum = pgEnum('oauth_provider', [
  'google',
  'discord'
]);

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
  'daily_reset',
  'subscription',
  'topup',
  'consumption',
  'refund',
  'admin_adjustment',
  'chargeback'
]);

// ============================================
// USERS TABLE (Extended for Stripe)
// ============================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  
  // Email verification & status
  emailVerified: boolean('email_verified').notNull().default(false),
  emailStatus: emailStatusEnum('email_status').notNull().default('valid'),
  
  // OAuth Discord
  discordId: text('discord_id').unique(),
  avatarUrl: text('avatar_url'),
  
  // Marketing preferences
  marketingOptIn: boolean('marketing_opt_in').notNull().default(true),
  
  // Activity tracking
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  
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

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  keyHash: text('key_hash').notNull(),
  label: text('label').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true })
});

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  boardId: text('board_id').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
});

export const captures = pgTable('captures', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  boardId: text('board_id').notNull(),
  scene: jsonb('scene').notNull(),
  imageUrl: text('image_url').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  byteSize: integer('byte_size').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
});

export const boards = pgTable('boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('Untitled Board'),
  scene: jsonb('scene').notNull().default({}),
  thumbnailUrl: text('thumbnail_url'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
});

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  captureId: uuid('capture_id').references(() => captures.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  deletedAt: timestamp('deleted_at', { withTimezone: true })
});

export const tutoringSessions = pgTable(
  'tutoring_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    boardId: text('board_id').notNull(),
    status: text('status').notNull().default('active'),
    plan: jsonb('plan'),
    state: jsonb('state'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    completedAt: timestamp('completed_at', { withTimezone: true })
  },
  (t) => ({
    conversationUserUnique: uniqueIndex('idx_tutoring_sessions_conversation_user').on(
      t.conversationId,
      t.userId
    )
  })
);

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
  amount: integer('amount').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  
  // Context
  reason: text('reason'),
  metadata: jsonb('metadata'),
  
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

// ============================================
// OAUTH ACCOUNTS (link multiple providers to one user)
// ============================================

export const oauthAccounts = pgTable('oauth_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: oauthProviderEnum('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  providerEmail: text('provider_email'),
  providerUsername: text('provider_username'),
  providerAvatar: text('provider_avatar'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
}, (t) => ({
  providerAccountUnique: uniqueIndex('idx_oauth_provider_account').on(t.provider, t.providerAccountId),
  userIdIdx: index('idx_oauth_accounts_user_id').on(t.userId),
  providerEmailIdx: index('idx_oauth_accounts_provider_email').on(t.providerEmail)
}));

// ============================================
// EMAIL TOKENS (verification, unsubscribe)
// ============================================

export const emailTokens = pgTable('email_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  type: text('type').notNull(), // 'verification' | 'unsubscribe'
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
}, (t) => ({
  tokenIdx: index('idx_email_tokens_token').on(t.token),
  userIdIdx: index('idx_email_tokens_user_id').on(t.userId)
}));

// ============================================
// EMAIL EVENTS (Resend webhooks log)
// ============================================

export const emailEvents = pgTable('email_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  resendId: text('resend_id').unique().notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  emailTo: text('email_to').notNull(),
  emailType: text('email_type').notNull(), // 'welcome', 'verification', 'retention_digest'
  eventType: text('event_type').notNull(), // 'delivered', 'bounced', 'complained', 'opened', 'clicked'
  bounceType: text('bounce_type'), // 'hard' | 'soft'
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
}, (t) => ({
  userIdIdx: index('idx_email_events_user_id').on(t.userId),
  eventTypeIdx: index('idx_email_events_event_type').on(t.eventType)
}));

// ============================================
// RETENTION JOBS (engagement emails scheduling)
// ============================================

export const retentionJobs = pgTable('retention_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  jobType: text('job_type').notNull(), // 'inactivity_3d', 'weekly_digest', etc.
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  status: text('status').notNull().default('pending'), // 'pending', 'sent', 'skipped', 'failed'
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
}, (t) => ({
  scheduledIdx: index('idx_retention_jobs_scheduled').on(t.scheduledFor),
  userIdIdx: index('idx_retention_jobs_user_id').on(t.userId)
}));
