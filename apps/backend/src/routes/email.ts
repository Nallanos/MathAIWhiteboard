/**
 * Email Routes
 * 
 * Handles email-related endpoints:
 * - Resend webhooks
 * - Email verification
 * - Unsubscribe
 * - Resend verification email
 */

import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import type { EmailService } from '../services/email-service.js';
import type { AuthService } from '../services/auth-service.js';
import { captureServerEvent } from '../lib/posthog.js';
import * as schema from '../db/schema.js';

type Database = NodePgDatabase<typeof schema>;

interface Dependencies {
  app: Express;
  emailService: EmailService;
  authService: AuthService;
  db: Database;
  resendWebhookSecret?: string;
  frontendUrl: string;
}

// Resend webhook event schema
const resendWebhookSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z.object({
    email_id: z.string().optional(),
    to: z.array(z.string()).optional(),
    from: z.string().optional(),
    subject: z.string().optional(),
    tags: z.array(z.object({
      name: z.string(),
      value: z.string()
    })).optional(),
    bounce: z.object({
      type: z.string()
    }).optional()
  })
});

export function registerEmailRoutes({ app, emailService, authService, db, resendWebhookSecret, frontendUrl }: Dependencies): void {
  
  // ============================================
  // POST /api/email/webhook
  // Resend webhook handler
  // ============================================
  app.post('/api/email/webhook', async (req: Request, res: Response) => {
    try {
      // Verify webhook signature if secret is configured
      if (resendWebhookSecret) {
        const signature = req.headers['svix-signature'] as string;
        const timestamp = req.headers['svix-timestamp'] as string;
        const svixId = req.headers['svix-id'] as string;

        if (!signature || !timestamp || !svixId) {
          console.error('[Email Webhook] Missing signature headers');
          return res.status(401).json({ error: 'Missing signature' });
        }

        // Verify the signature
        const isValid = verifyResendSignature(
          req.body,
          signature,
          timestamp,
          resendWebhookSecret
        );

        if (!isValid) {
          console.error('[Email Webhook] Invalid signature');
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }

      // Parse the webhook event
      const event = resendWebhookSchema.parse(req.body);

      console.log(`[Email Webhook] Received ${event.type} event`);

      // Process the webhook
      await emailService.handleWebhook({
        type: event.type,
        data: {
          email_id: event.data.email_id,
          to: event.data.to,
          tags: event.data.tags,
          bounce: event.data.bounce
        }
      });

      return res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('[Email Webhook] Error:', error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }

      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // ============================================
  // GET /api/email/verify
  // Email verification endpoint
  // ============================================
  app.get('/api/email/verify', async (req: Request, res: Response) => {
    try {
      const token = req.query.token;
      
      if (typeof token !== 'string' || !token) {
        return res.status(400).json({ error: 'Token required' });
      }

      const result = await emailService.verifyEmailToken(token);

      if (!result.valid) {
        return res.status(400).json({ error: result.error });
      }

      captureServerEvent('email_verified', result.userId!, {
        method: 'token'
      });

      // Redirect to frontend success page
      return res.redirect(`${frontendUrl}/email-verified?success=true`);
    } catch (error) {
      console.error('[Email Verify] Error:', error);
      return res.redirect(`${frontendUrl}/email-verified?success=false&error=unexpected`);
    }
  });

  // ============================================
  // GET /api/email/unsubscribe
  // One-click unsubscribe (no login required)
  // ============================================
  app.get('/api/email/unsubscribe', async (req: Request, res: Response) => {
    try {
      const token = req.query.token;
      
      if (typeof token !== 'string' || !token) {
        return res.status(400).json({ error: 'Token required' });
      }

      const result = await emailService.handleUnsubscribe(token);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Return a simple HTML page confirming unsubscribe
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Désabonnement - WhiteboardAI</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                background: #f6f9fc;
              }
              .card {
                background: white;
                padding: 48px;
                border-radius: 8px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                text-align: center;
                max-width: 400px;
              }
              h1 { color: #1a1a1a; font-size: 24px; margin: 0 0 16px; }
              p { color: #666; font-size: 16px; line-height: 1.5; margin: 0; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>✅ Désabonnement confirmé</h1>
              <p>Vous ne recevrez plus d'emails marketing de WhiteboardAI.</p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('[Email Unsubscribe] Error:', error);
      return res.status(500).json({ error: 'Unsubscribe failed' });
    }
  });

  // ============================================
  // POST /api/email/unsubscribe (for List-Unsubscribe-Post)
  // ============================================
  app.post('/api/email/unsubscribe', async (req: Request, res: Response) => {
    try {
      const token = req.query.token || req.body?.token;
      
      if (typeof token !== 'string' || !token) {
        return res.status(400).json({ error: 'Token required' });
      }

      const result = await emailService.handleUnsubscribe(token);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Email Unsubscribe POST] Error:', error);
      return res.status(500).json({ error: 'Unsubscribe failed' });
    }
  });

  // ============================================
  // POST /api/email/resend-verification
  // Resend verification email (authenticated)
  // ============================================
  app.post('/api/email/resend-verification', async (req: Request, res: Response) => {
    try {
      // Get user from auth header
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.slice(7);
      const payload = authService.verifyToken(token);
      
      if (!payload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Get user from database
      const user = await getUser(payload.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.emailVerified) {
        return res.status(400).json({ error: 'Email already verified' });
      }

      // Rate limit: max 1 email per 5 minutes
      // In production, use Redis for rate limiting
      const result = await emailService.sendVerificationEmail(
        user.id,
        user.email,
        user.displayName
      );

      if (!result.success) {
        return res.status(500).json({ error: 'Failed to send email' });
      }

      return res.json({ success: true, message: 'Verification email sent' });
    } catch (error) {
      console.error('[Resend Verification] Error:', error);
      return res.status(500).json({ error: 'Failed to resend verification' });
    }
  });

  // Helper to get user
  async function getUser(userId: string) {
    return db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: {
        id: true,
        email: true,
        displayName: true,
        emailVerified: true
      }
    });
  }
}

// ============================================
// Signature Verification
// ============================================

function verifyResendSignature(
  payload: any,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  try {
    // Resend uses Svix for webhooks
    // Signature format: v1,<base64-signature>
    const signatures = signature.split(' ').map(s => {
      const [version, sig] = s.split(',');
      return { version, signature: sig };
    });

    const v1Sig = signatures.find(s => s.version === 'v1');
    if (!v1Sig) return false;

    const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(v1Sig.signature, 'base64'),
      Buffer.from(expectedSig, 'base64')
    );
  } catch (error) {
    console.error('[Email Webhook] Signature verification error:', error);
    return false;
  }
}
