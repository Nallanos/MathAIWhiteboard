import type { Express, Request, Response } from 'express';

export function registerStripeRoutes(app: Express): void {
  app.post('/api/stripe/webhook', (req: Request, res: Response) => {
    // Placeholder for Stripe webhook signature verification.
    console.log('Received Stripe webhook');
    res.status(200).send('ok');
  });
}
