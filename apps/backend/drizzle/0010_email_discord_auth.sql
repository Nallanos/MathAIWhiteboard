-- Migration: Email Service & Discord Authentication
-- Add fields for email verification, Discord OAuth, marketing preferences

-- ============================================
-- Enum for email bounce status
-- ============================================
CREATE TYPE email_status AS ENUM ('valid', 'bounced', 'complained', 'unsubscribed');

-- ============================================
-- Enum for OAuth provider
-- ============================================
CREATE TYPE oauth_provider AS ENUM ('google', 'discord');

-- ============================================
-- Update users table
-- ============================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_status email_status NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS discord_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE;

-- ============================================
-- OAuth Accounts (link multiple providers to one user)
-- ============================================
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider oauth_provider NOT NULL,
  provider_account_id TEXT NOT NULL,
  provider_email TEXT,
  provider_username TEXT,
  provider_avatar TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_email ON oauth_accounts(provider_email);

-- ============================================
-- Email verification tokens
-- ============================================
CREATE TABLE IF NOT EXISTS email_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL, -- 'verification' | 'unsubscribe'
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_token ON email_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user_id ON email_tokens(user_id);

-- ============================================
-- Email events log (for Resend webhooks)
-- ============================================
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email_to TEXT NOT NULL,
  email_type TEXT NOT NULL, -- 'welcome', 'verification', 'retention_digest', etc.
  event_type TEXT NOT NULL, -- 'delivered', 'bounced', 'complained', 'opened', 'clicked'
  bounce_type TEXT, -- 'hard' | 'soft'
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_events_user_id ON email_events(user_id);
CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type);

-- ============================================
-- Engagement/Retention job tracking
-- ============================================
CREATE TABLE IF NOT EXISTS retention_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL, -- 'inactivity_3d', 'weekly_digest', etc.
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'skipped', 'failed'
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retention_jobs_scheduled ON retention_jobs(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_retention_jobs_user_id ON retention_jobs(user_id);
