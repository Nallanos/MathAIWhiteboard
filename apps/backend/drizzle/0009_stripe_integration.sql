-- Stripe Integration Migration
-- Adds subscription management, credit transactions, webhook logging, and top-up packages

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE subscription_status AS ENUM (
  'trialing', 'active', 'past_due', 'canceled', 
  'unpaid', 'incomplete', 'incomplete_expired', 'paused'
);

CREATE TYPE subscription_plan AS ENUM ('free', 'pro');

CREATE TYPE credit_transaction_type AS ENUM (
  'daily_reset', 'subscription', 'topup', 
  'consumption', 'refund', 'admin_adjustment', 'chargeback'
);

-- ============================================
-- EXTEND USERS TABLE
-- ============================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS plan subscription_plan NOT NULL DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_status subscription_status,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Create index on stripe_customer_id for webhook lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);

-- ============================================
-- SUBSCRIPTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS subscriptions (
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

-- ============================================
-- CREDIT TRANSACTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS credit_transactions (
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

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);

-- ============================================
-- WEBHOOK EVENTS TABLE (Idempotency)
-- ============================================

CREATE TABLE IF NOT EXISTS webhook_events (
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

CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_event_id ON webhook_events(stripe_event_id);

-- ============================================
-- TOP-UP PACKAGES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS topup_packages (
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

-- ============================================
-- SEED TOP-UP PACKAGES
-- ============================================

INSERT INTO topup_packages (stripe_price_id, stripe_product_id, name, credits, price_in_cents, currency, active)
VALUES 
  ('price_topup_50', 'prod_topup', '50 Credits', 50, 499, 'eur', true),
  ('price_topup_200', 'prod_topup', '200 Credits', 200, 1499, 'eur', true),
  ('price_topup_500', 'prod_topup', '500 Credits', 500, 2999, 'eur', true)
ON CONFLICT (stripe_price_id) DO NOTHING;
