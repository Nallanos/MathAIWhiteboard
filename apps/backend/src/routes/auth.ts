import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type { AuthService } from '../services/auth-service.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(2)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

interface Dependencies {
  app: Express;
  authService: AuthService;
}

export function registerAuthRoutes({ app, authService }: Dependencies): void {
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
      res.json(result);
    } catch (error: any) {
      if (error.message === 'Invalid credentials') {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      console.error('Login failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
