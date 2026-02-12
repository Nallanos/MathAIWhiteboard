# Implementation Summary: Email Service & Discord OAuth

## Overview

This implementation adds two major features to WhiteboardAI:
1. **Email Service** with Resend + React Email for transactional and retention emails
2. **Discord OAuth** authentication with account linking

---

## 1. Database Schema Changes

### New Fields in `users` Table
- `email_verified` (boolean) - Whether email is verified
- `email_status` (enum) - 'valid', 'bounced', 'complained', 'unsubscribed'
- `discord_id` (text, unique) - Discord user ID
- `avatar_url` (text) - User avatar URL
- `marketing_opt_in` (boolean) - Marketing email preference
- `last_login_at` (timestamp) - Last login timestamp
- `last_activity_at` (timestamp) - Last activity timestamp

### New Tables

#### `oauth_accounts`
Links multiple OAuth providers to a single user account.
- `provider` - 'google' | 'discord'
- `provider_account_id` - ID from the OAuth provider
- `provider_email`, `provider_username`, `provider_avatar` - Profile data
- `access_token`, `refresh_token`, `expires_at` - Token storage

#### `email_tokens`
Secure tokens for email verification and unsubscribe.
- `token` - Cryptographically secure token
- `type` - 'verification' | 'unsubscribe'
- `expires_at` - Token expiration
- `used_at` - When token was consumed

#### `email_events`
Logs all Resend webhook events for analytics and debugging.
- `resend_id` - Resend email ID
- `event_type` - 'delivered', 'bounced', 'complained', etc.
- `bounce_type` - 'hard' | 'soft' for bounce events

#### `retention_jobs`
Schedules and tracks engagement email campaigns.
- `job_type` - 'inactivity_3d', 'weekly_digest', etc.
- `status` - 'pending', 'sent', 'skipped', 'failed'

---

## 2. Services

### EmailService (`src/services/email-service.ts`)

Key methods:
- `sendWelcomeEmail(userId, email, displayName)` - Sends welcome with verification link
- `sendVerificationEmail(userId, email, displayName)` - Resend verification
- `sendRetentionDigest(userId, email, displayName, stats)` - Engagement email
- `verifyEmailToken(token)` - Validates and consumes tokens
- `handleUnsubscribe(token)` - One-click unsubscribe
- `handleWebhook(event)` - Processes Resend webhook events
- `getAndProcessPendingRetentionJobs(limit)` - Batch process scheduled emails

### AuthService Updates (`src/services/auth-service.ts`)

New methods:
- `loginWithDiscord(discordUser, tokens)` - Discord OAuth login/registration
- `getLinkedAccounts(userId)` - List linked OAuth providers
- `unlinkOAuthAccount(userId, provider)` - Remove OAuth link
- `updateLastActivity(userId)` - Track user activity

---

## 3. Email Templates

React Email templates in `src/services/emails/`:

### WelcomeEmail
- Sent immediately after registration
- Contains non-blocking verification link
- Features list and CTA
- One-click unsubscribe in footer

### VerificationEmail
- Sent when user requests verification resend
- Clean, focused design
- 24-hour expiration notice

### RetentionDigestEmail
- Re-engagement email for inactive users
- Shows user stats (board count, last activity)
- Suggestions for what to do next
- One-click unsubscribe

---

## 4. API Endpoints

### Discord OAuth

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/discord/login` | Initiates OAuth flow (redirects to Discord) |
| GET | `/api/auth/discord/callback` | Handles OAuth callback |
| POST | `/api/auth/discord/token` | Exchange code for token (SPA flow) |

### Email

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/email/webhook` | Resend webhook receiver |
| GET | `/api/email/verify?token=` | Verify email address |
| GET | `/api/email/unsubscribe?token=` | One-click unsubscribe |
| POST | `/api/email/unsubscribe?token=` | List-Unsubscribe-Post support |
| POST | `/api/email/resend-verification` | Resend verification (authenticated) |

---

## 5. Environment Variables

Add to `.env`:

```env
# Discord OAuth
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
DISCORD_REDIRECT_URI=https://yourapp.com/api/auth/discord/callback

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
EMAIL_FROM_NAME=WhiteboardAI
```

---

## 6. Setup Steps

### 1. Run Database Migration
```bash
cd apps/backend
pnpm db:migrate
```

### 2. Configure Discord OAuth
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to OAuth2 settings
4. Add redirect URI: `https://yourapp.com/api/auth/discord/callback`
5. Copy Client ID and Client Secret to `.env`

### 3. Configure Resend
1. Create account at [resend.com](https://resend.com)
2. Verify your domain for sending emails
3. Create API key and add to `.env`
4. Set up webhook:
   - URL: `https://yourapp.com/api/email/webhook`
   - Events: `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`

### 4. Test the Flow
```bash
# Start backend
pnpm dev

# Test Discord OAuth
open http://localhost:5173/api/auth/discord/login

# Test email (after registration)
# Welcome email should be sent automatically
```

---

## 7. Retention Jobs (Cron Setup)

For production, set up a cron job to process retention emails:

```bash
# Every hour, process pending retention jobs
0 * * * * curl -X POST https://yourapp.com/api/internal/process-retention-jobs
```

Or use a scheduled job service (Railway cron, Vercel cron, etc.)

---

## 8. Security Considerations

### Token Security
- All tokens are cryptographically secure (32 bytes, base64url)
- Tokens are single-use (marked as used after consumption)
- Verification tokens expire in 24-72 hours
- Unsubscribe tokens expire in 1 year

### Webhook Security
- Resend webhooks are verified using HMAC signature
- Signature verification uses timing-safe comparison

### Account Linking
- Email collision is handled by linking accounts
- Users cannot unlink their last authentication method
- Discord `verified` flag is trusted for email verification

---

## Files Created/Modified

### Created
- `drizzle/0010_email_discord_auth.sql`
- `src/services/email-service.ts`
- `src/services/emails/welcome.tsx`
- `src/services/emails/verification.tsx`
- `src/services/emails/retention-digest.tsx`
- `src/services/emails/index.ts`
- `src/routes/discord-auth.ts`
- `src/routes/email.ts`

### Modified
- `src/db/schema.ts` - Added new enums and tables
- `src/services/auth-service.ts` - Added Discord OAuth methods
- `src/lib/env.ts` - Added new environment variables
- `src/index.ts` - Registered new services and routes
- `tsconfig.json` - Added JSX support
- `package.json` - Added dependencies
- `.env.example` - Updated with new variables
