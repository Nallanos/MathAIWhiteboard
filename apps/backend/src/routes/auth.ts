import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type { AuthService } from '../services/auth-service.js';
import { OAuth2Client } from 'google-auth-library';
import { captureServerEvent } from '../lib/posthog.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(2)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

const googleAuthSchema = z.object({
  credential: z.string().min(20)
});

interface Dependencies {
  app: Express;
  authService: AuthService;
  googleClientId: string;
}

export function registerAuthRoutes({ app, authService, googleClientId }: Dependencies): void {
  const allowedAudiences = String(googleClientId || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const oauthClient = new OAuth2Client(allowedAudiences[0]);

  const tryDecodeJwtPayload = (token: string): Record<string, unknown> | null => {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const payload = parts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
      const json = Buffer.from(padded, 'base64').toString('utf8');
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    const payload = registerSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({ errors: payload.error.flatten() });
    }

    try {
      const result = await authService.register(
        payload.data.email,
        payload.data.password,
        payload.data.displayName
      );

      captureServerEvent('user_registered', result.user.id, {
        email: result.user.email,
        displayName: result.user.displayName,
        method: 'password',
      });

      res.status(201).json(result);
    } catch (error: any) {
      if (error.message === 'User already exists') {
        return res.status(409).json({ error: 'User already exists' });
      }
      console.error('Registration failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const payload = loginSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({ errors: payload.error.flatten() });
    }

    try {
      const result = await authService.login(payload.data.email, payload.data.password);

      captureServerEvent('user_logged_in', result.user.id, {
        email: result.user.email,
        displayName: result.user.displayName,
        method: 'password',
      });

      res.json(result);
    } catch (error: any) {
      if (error.message === 'Invalid credentials') {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      console.error('Login failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/auth/google', async (req: Request, res: Response) => {
    const payload = googleAuthSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({ errors: payload.error.flatten() });
    }

    if (allowedAudiences.length === 0) {
      return res.status(503).json({
        error: 'Google OAuth is not configured (missing GOOGLE_CLIENT_ID)',
      });
    }

    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken: payload.data.credential,
        audience: allowedAudiences,
      });

      const tokenPayload = ticket.getPayload();
      if (!tokenPayload?.email) {
        return res.status(400).json({ error: 'Google token missing email' });
      }

      if (tokenPayload.email_verified === false) {
        return res.status(401).json({ error: 'Google email not verified' });
      }

      const displayName = tokenPayload.name || tokenPayload.email;
      const result = await authService.loginWithGoogle(tokenPayload.email, displayName);

      captureServerEvent('user_logged_in', result.user.id, {
        email: result.user.email,
        displayName: result.user.displayName,
        method: 'google',
      });

      res.json(result);
    } catch (error: any) {
      const decoded = tryDecodeJwtPayload(payload.data.credential);
      const decodedAud =
        decoded && typeof decoded === 'object' ? (decoded as any).aud : undefined;
      const decodedIss =
        decoded && typeof decoded === 'object' ? (decoded as any).iss : undefined;

      console.error('Google login failed', {
        message: error?.message,
        name: error?.name,
        aud: decodedAud,
        iss: decodedIss,
      });

      const message = typeof error?.message === 'string' ? error.message : '';
      const hint = /aud|audience|Wrong recipient|recipient/i.test(message)
        ? ' (client id mismatch)'
        : '';

      res.status(401).json({
        error: `Invalid Google token${hint}`,
        details: {
          tokenAud: decodedAud,
          tokenIss: decodedIss,
          expectedAudiences: allowedAudiences,
        },
      });
    }
  });
}
