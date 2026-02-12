/**
 * Stripe Routes
 * 
 * Handles checkout sessions, customer portal, and webhook events.
 */

import type { Express, Request, Response, RequestHandler } from 'express';
import express from 'express';
import { z } from 'zod';
import type { StripeService } from '../services/stripe-service.js';
import type { CreditsService } from '../services/credits-service.js';
import type { AuthenticatedRequest } from '../middleware/types.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';

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
  creditsService: CreditsService;
  db: NodePgDatabase<typeof schema>;
}

export function registerStripeRoutes({ 
  app, 
  authMiddleware, 
  stripeService, 
  creditsService,
  db 
}: Dependencies): void {
  
  // Create Checkout Session
  app.post('/api/stripe/checkout', authMiddleware, async (req: Request, res: Response) => {
    const parsed = checkoutSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.flatten() });
    }

    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;

    try {
      // Get user email
      const [user] = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, userId));

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const session = await stripeService.createCheckoutSession(
        userId,
        user.email,
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

  // Get credits balance
  app.get('/api/me/credits', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;

    try {
      const credits = await creditsService.getBalance(userId);
      return res.status(200).json(credits);
    } catch (error) {
      console.error('[Credits] Balance fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch credits balance' });
    }
  });

  // Get credit transaction history
  app.get('/api/me/credits/history', authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;

    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const transactions = await creditsService.getTransactionHistory(userId, limit);
      return res.status(200).json(transactions);
    } catch (error) {
      console.error('[Credits] History fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch transaction history' });
    }
  });

  // Get available top-up packages
  app.get('/api/stripe/topups', async (_req: Request, res: Response) => {
    try {
      const packages = await db
        .select()
        .from(schema.topupPackages)
        .where(eq(schema.topupPackages.active, true));
      
      return res.status(200).json(packages);
    } catch (error) {
      console.error('[Stripe] Top-up packages fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch top-up packages' });
    }
  });

  // Webhook endpoint - MUST use raw body for signature verification
  app.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
      const signature = req.headers['stripe-signature'] as string;

      if (!signature) {
        console.error('[Stripe] Missing webhook signature');
        return res.status(400).json({ error: 'Missing stripe-signature header' });
      }

      try {
        // Verify signature and parse event
        const event = stripeService.verifyWebhookSignature(
          req.body as Buffer,
          signature
        );

        // Process the event
        await stripeService.handleWebhook(event);

        return res.status(200).json({ received: true });
      } catch (error) {
        console.error('[Stripe] Webhook error:', error);
        
        if ((error as Error).message?.includes('signature')) {
          return res.status(400).json({ error: 'Invalid signature' });
        }
        
        // Return 500 so Stripe will retry
        return res.status(500).json({ error: 'Webhook processing failed' });
      }
    }
  );
}
