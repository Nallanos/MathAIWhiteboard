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
  const oauthClient = new OAuth2Client(googleClientId);

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

    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken: payload.data.credential,
        audience: googleClientId
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
      console.error('Google login failed', error);
      res.status(401).json({ error: 'Invalid Google token' });
    }
  });
}
