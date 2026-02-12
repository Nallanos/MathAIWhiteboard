/**
 * Discord OAuth Routes
 * 
 * Handles Discord OAuth2 authentication flow.
 */

import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type { AuthService, DiscordUser, DiscordTokens } from '../services/auth-service.js';
import type { EmailService } from '../services/email-service.js';
import { captureServerEvent } from '../lib/posthog.js';
import crypto from 'node:crypto';

const discordCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().optional()
});

interface DiscordConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface Dependencies {
  app: Express;
  authService: AuthService;
  emailService?: EmailService;
  discordConfig: DiscordConfig;
}

// In-memory state store (use Redis in production for multi-instance)
const stateStore = new Map<string, { createdAt: number; returnUrl?: string }>();

// Clean up expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes
  for (const [state, data] of stateStore) {
    if (now - data.createdAt > maxAge) {
      stateStore.delete(state);
    }
  }
}, 5 * 60 * 1000);

export function registerDiscordAuthRoutes({ app, authService, emailService, discordConfig }: Dependencies): void {
  const DISCORD_API_BASE = 'https://discord.com/api/v10';
  const DISCORD_OAUTH_URL = 'https://discord.com/oauth2/authorize';

  // ============================================
  // GET /api/auth/discord/login
  // Redirects to Discord OAuth
  // ============================================
  app.get('/api/auth/discord/login', (req: Request, res: Response) => {
    const state = crypto.randomBytes(16).toString('hex');
    const returnUrl = typeof req.query.returnUrl === 'string' ? req.query.returnUrl : undefined;
    
    stateStore.set(state, { createdAt: Date.now(), returnUrl });

    const params = new URLSearchParams({
      client_id: discordConfig.clientId,
      redirect_uri: discordConfig.redirectUri,
      response_type: 'code',
      scope: 'identify email',
      state,
      prompt: 'consent'
    });

    const authUrl = `${DISCORD_OAUTH_URL}?${params.toString()}`;
    res.redirect(authUrl);
  });

  // ============================================
  // GET /api/auth/discord/callback
  // Handles Discord OAuth callback
  // ============================================
  app.get('/api/auth/discord/callback', async (req: Request, res: Response) => {
    try {
      const { code, state } = discordCallbackSchema.parse(req.query);

      // Validate state
      const stateData = stateStore.get(state || '');
      if (!stateData) {
        return res.status(400).json({ error: 'Invalid or expired state' });
      }
      stateStore.delete(state || '');

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(code, discordConfig);
      if (!tokens) {
        return res.status(400).json({ error: 'Failed to exchange code for tokens' });
      }

      // Get Discord user info
      const discordUser = await getDiscordUser(tokens.access_token);
      if (!discordUser) {
        return res.status(400).json({ error: 'Failed to get Discord user info' });
      }

      // Login or create user
      const result = await authService.loginWithDiscord(discordUser, tokens);

      captureServerEvent('user_logged_in', result.user.id, {
        email: result.user.email,
        displayName: result.user.displayName,
        method: 'discord',
        isNewUser: result.isNewUser,
        linkedAccount: (result as any).linkedAccount || false
      });

      // Send welcome email for new users
      if (result.isNewUser && emailService && discordUser.email) {
        emailService.sendWelcomeEmail(result.user.id, discordUser.email, result.user.displayName)
          .catch(err => console.error('[Discord Auth] Failed to send welcome email:', err));
      }

      // Redirect back to frontend with token
      const returnUrl = stateData.returnUrl || '/';
      const separator = returnUrl.includes('?') ? '&' : '?';
      res.redirect(`${returnUrl}${separator}token=${result.token}`);
    } catch (error: any) {
      console.error('[Discord Auth] Callback error:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid callback parameters' });
      }

      return res.status(500).json({ error: 'Authentication failed' });
    }
  });

  // ============================================
  // POST /api/auth/discord/token
  // Exchange code for token (for SPA flow)
  // ============================================
  app.post('/api/auth/discord/token', async (req: Request, res: Response) => {
    try {
      const { code } = z.object({ code: z.string().min(1) }).parse(req.body);

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(code, discordConfig);
      if (!tokens) {
        return res.status(400).json({ error: 'Failed to exchange code for tokens' });
      }

      // Get Discord user info
      const discordUser = await getDiscordUser(tokens.access_token);
      if (!discordUser) {
        return res.status(400).json({ error: 'Failed to get Discord user info' });
      }

      // Login or create user
      const result = await authService.loginWithDiscord(discordUser, tokens);

      captureServerEvent('user_logged_in', result.user.id, {
        email: result.user.email,
        displayName: result.user.displayName,
        method: 'discord',
        isNewUser: result.isNewUser
      });

      // Send welcome email for new users
      if (result.isNewUser && emailService && discordUser.email) {
        emailService.sendWelcomeEmail(result.user.id, discordUser.email, result.user.displayName)
          .catch(err => console.error('[Discord Auth] Failed to send welcome email:', err));
      }

      return res.json(result);
    } catch (error: any) {
      console.error('[Discord Auth] Token exchange error:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request body' });
      }

      return res.status(500).json({ error: 'Authentication failed' });
    }
  });

  // ============================================
  // Helper Functions
  // ============================================

  async function exchangeCodeForTokens(code: string, config: DiscordConfig): Promise<DiscordTokens | null> {
    try {
      const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.redirectUri
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[Discord Auth] Token exchange failed:', error);
        return null;
      }

      return await response.json() as DiscordTokens;
    } catch (error) {
      console.error('[Discord Auth] Token exchange error:', error);
      return null;
    }
  }

  async function getDiscordUser(accessToken: string): Promise<DiscordUser | null> {
    try {
      const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[Discord Auth] User fetch failed:', error);
        return null;
      }

      return await response.json() as DiscordUser;
    } catch (error) {
      console.error('[Discord Auth] User fetch error:', error);
      return null;
    }
  }
}
