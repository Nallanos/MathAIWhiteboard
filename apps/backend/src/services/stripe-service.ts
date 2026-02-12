/**
 * Stripe Service
 * 
 * Handles all Stripe-related operations: checkout, portal, webhooks, and subscription management.
 */

import Stripe from 'stripe';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { SubscriptionPlan, SubscriptionStatus, SubscriptionState, CreditsState } from '@mathboard/shared';
import { PLAN_CONFIGS } from '@mathboard/shared';

interface StripeServiceConfig {
  db: NodePgDatabase<typeof schema>;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  frontendUrl: string;
  proPriceIds: {
    monthly: string;
    yearly: string;
  };
}

export class StripeService {
  private stripe: Stripe;
  private db: NodePgDatabase<typeof schema>;
  private webhookSecret: string;
  private frontendUrl: string;
  private proPriceIds: { monthly: string; yearly: string };

  constructor(config: StripeServiceConfig) {
    this.stripe = new Stripe(config.stripeSecretKey, {
      apiVersion: '2024-12-18.acacia' as any
    });
    this.db = config.db;
    this.webhookSecret = config.stripeWebhookSecret;
    this.frontendUrl = config.frontendUrl;
    this.proPriceIds = config.proPriceIds;
  }

  // ============================================
  // CUSTOMER MANAGEMENT
  // ============================================

  async getOrCreateCustomer(userId: string, email: string): Promise<string> {
    // Check if user already has a Stripe customer
    const [user] = await this.db
      .select({ stripeCustomerId: schema.users.stripeCustomerId })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (user?.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    // Create new Stripe customer
    const customer = await this.stripe.customers.create({
      email,
      metadata: {
        userId,
        source: 'whiteboard-ai'
      }
    });

    // Save customer ID to database
    await this.db
      .update(schema.users)
      .set({ 
        stripeCustomerId: customer.id,
        updatedAt: new Date()
      })
      .where(eq(schema.users.id, userId));

    return customer.id;
  }

  // ============================================
  // CHECKOUT SESSION
  // ============================================

  async createCheckoutSession(
    userId: string,
    email: string,
    priceId: string,
    mode: 'subscription' | 'payment',
    successUrl: string,
    cancelUrl: string
  ): Promise<{ sessionId: string; url: string }> {
    const customerId = await this.getOrCreateCustomer(userId, email);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: cancelUrl,
      metadata: {
        userId,
        priceId
      },
      // Collect billing address for tax compliance
      billing_address_collection: 'required',
      // Enable automatic tax calculation if configured
      automatic_tax: { enabled: true },
      // Allow promotion codes
      allow_promotion_codes: true
    };

    // For subscriptions, add trial if eligible
    if (mode === 'subscription') {
      // Check if user already had a trial
      const existingSubscriptions = await this.db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId));

      if (existingSubscriptions.length === 0) {
        sessionParams.subscription_data = {
          trial_period_days: 7
        };
      }
    }

    const session = await this.stripe.checkout.sessions.create(sessionParams);

    return {
      sessionId: session.id,
      url: session.url!
    };
  }

  // ============================================
  // CUSTOMER PORTAL
  // ============================================

  async createPortalSession(userId: string): Promise<{ url: string }> {
    const [user] = await this.db
      .select({ stripeCustomerId: schema.users.stripeCustomerId })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (!user?.stripeCustomerId) {
      throw new Error('No Stripe customer found for this user');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${this.frontendUrl}/settings/billing`
    });

    return { url: session.url };
  }

  // ============================================
  // SUBSCRIPTION STATUS
  // ============================================

  async getSubscriptionStatus(userId: string): Promise<SubscriptionState> {
    const [user] = await this.db
      .select({
        plan: schema.users.plan,
        subscriptionStatus: schema.users.subscriptionStatus
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (!user) {
      throw new Error('User not found');
    }

    const [subscription] = await this.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId));

    return {
      plan: user.plan,
      status: user.subscriptionStatus,
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      features: PLAN_CONFIGS[user.plan].features
    };
  }

  // ============================================
  // WEBHOOK HANDLING
  // ============================================

  verifyWebhookSignature(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret
    );
  }

  async handleWebhook(event: Stripe.Event): Promise<void> {
    // 1. Check idempotency - has this event been processed?
    const existingEvent = await this.db
      .select()
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.stripeEventId, event.id));

    if (existingEvent.length > 0 && existingEvent[0].processed) {
      console.log(`[Stripe] Skipping duplicate event: ${event.id}`);
      return;
    }

    // 2. Record event (or update if exists but not processed)
    if (existingEvent.length === 0) {
      await this.db.insert(schema.webhookEvents).values({
        stripeEventId: event.id,
        eventType: event.type,
        payload: event as any,
        processed: false
      });
    }

    try {
      // 3. Process event based on type
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionChange(event.data.object as Stripe.Subscription);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
        case 'invoice.paid':
          await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
          break;
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;
        case 'charge.dispute.created':
          await this.handleChargebackCreated(event.data.object as Stripe.Dispute);
          break;
        default:
          console.log(`[Stripe] Unhandled event type: ${event.type}`);
      }

      // 4. Mark event as processed
      await this.db
        .update(schema.webhookEvents)
        .set({
          processed: true,
          processedAt: new Date()
        })
        .where(eq(schema.webhookEvents.stripeEventId, event.id));

    } catch (error) {
      // 5. Record error for retry/debugging
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await this.db
        .update(schema.webhookEvents)
        .set({
          errorMessage,
          retryCount: sql`retry_count + 1`
        })
        .where(eq(schema.webhookEvents.stripeEventId, event.id));

      throw error; // Re-throw to return 500 to Stripe for retry
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.userId;
    if (!userId) {
      console.error('[Stripe] Checkout session missing userId metadata');
      return;
    }

    if (session.mode === 'payment') {
      // Top-up purchase - credits will be added via invoice.paid
      console.log(`[Stripe] Top-up checkout completed for user ${userId}`);
    }
    // Subscription is handled by customer.subscription.created
  }

  private async handleSubscriptionChange(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    
    // Find user by Stripe customer ID
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.stripeCustomerId, customerId));

    if (!user) {
      console.error(`[Stripe] No user found for customer ${customerId}`);
      return;
    }

    // Determine plan from price ID
    const priceId = subscription.items.data[0]?.price.id;
    const plan = this.getPlanFromPriceId(priceId);
    const status = subscription.status as SubscriptionStatus;

    // Access subscription properties - these may vary by API version
    const subAny = subscription as any;
    const currentPeriodStart = subAny.current_period_start ?? subAny.currentPeriodStart;
    const currentPeriodEnd = subAny.current_period_end ?? subAny.currentPeriodEnd;
    const canceledAt = subAny.canceled_at ?? subAny.canceledAt;
    const trialStart = subAny.trial_start ?? subAny.trialStart;
    const trialEnd = subAny.trial_end ?? subAny.trialEnd;
    const cancelAtPeriodEnd = subAny.cancel_at_period_end ?? subAny.cancelAtPeriodEnd ?? false;

    // Upsert subscription record
    const subscriptionData = {
      userId: user.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      stripeProductId: subscription.items.data[0]?.price.product as string,
      plan,
      status,
      currentPeriodStart: new Date(currentPeriodStart * 1000),
      currentPeriodEnd: new Date(currentPeriodEnd * 1000),
      cancelAtPeriodEnd,
      canceledAt: canceledAt 
        ? new Date(canceledAt * 1000) 
        : null,
      trialStart: trialStart 
        ? new Date(trialStart * 1000) 
        : null,
      trialEnd: trialEnd 
        ? new Date(trialEnd * 1000) 
        : null,
      updatedAt: new Date()
    };

    await this.db
      .insert(schema.subscriptions)
      .values(subscriptionData)
      .onConflictDoUpdate({
        target: schema.subscriptions.stripeSubscriptionId,
        set: subscriptionData
      });

    // Update denormalized user fields
    await this.db
      .update(schema.users)
      .set({
        plan,
        subscriptionStatus: status,
        updatedAt: new Date()
      })
      .where(eq(schema.users.id, user.id));

    console.log(`[Stripe] Subscription ${subscription.id} updated: ${plan}/${status}`);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.stripeCustomerId, customerId));

    if (!user) return;

    // Update subscription record
    await this.db
      .update(schema.subscriptions)
      .set({
        status: 'canceled',
        canceledAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(schema.subscriptions.stripeSubscriptionId, subscription.id));

    // Downgrade user to free plan
    await this.db
      .update(schema.users)
      .set({
        plan: 'free',
        subscriptionStatus: 'canceled',
        updatedAt: new Date()
      })
      .where(eq(schema.users.id, user.id));

    console.log(`[Stripe] User ${user.id} downgraded to free plan`);
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.stripeCustomerId, customerId));

    if (!user) return;

    // Access invoice properties - types may vary by API version
    const invoiceAny = invoice as any;
    const subscriptionId = invoiceAny.subscription;
    const paymentIntent = invoiceAny.payment_intent ?? invoiceAny.paymentIntent;

    // Check if this is a top-up payment (not a subscription)
    if (!subscriptionId) {
      // Find the top-up package from the line items
      for (const lineItem of invoice.lines.data) {
        const lineItemAny = lineItem as any;
        const priceId = lineItemAny.price?.id;
        if (priceId) {
          const [topupPackage] = await this.db
            .select()
            .from(schema.topupPackages)
            .where(eq(schema.topupPackages.stripePriceId, priceId));

          if (topupPackage) {
            await this.addCredits(
              user.id,
              topupPackage.credits,
              'topup',
              `Top-up: ${topupPackage.name}`,
              paymentIntent as string,
              invoice.id
            );
          }
        }
      }
    } else {
      // Subscription renewal - add monthly credits for Pro
      if (user.plan === 'pro') {
        const monthlyCredits = PLAN_CONFIGS.pro.features.aiCreditsPerMonth;
        await this.addCredits(
          user.id,
          monthlyCredits,
          'subscription',
          'Monthly Pro subscription credits',
          paymentIntent as string,
          invoice.id
        );
      }
    }
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    
    console.log(`[Stripe] Payment failed for customer ${customerId}, invoice ${invoice.id}`);
    
    // The subscription status will be updated via subscription.updated webhook
    // You could send a notification email here
  }

  private async handleChargebackCreated(dispute: Stripe.Dispute): Promise<void> {
    const chargeId = dispute.charge as string;
    
    // Get the charge to find the customer
    const charge = await this.stripe.charges.retrieve(chargeId);
    const customerId = charge.customer as string;
    
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.stripeCustomerId, customerId));

    if (!user) return;

    // Deduct the disputed credits
    const amountInCredits = Math.ceil(dispute.amount / 100); // Convert cents to credits
    
    await this.addCredits(
      user.id,
      -amountInCredits,
      'chargeback',
      `Chargeback for dispute ${dispute.id}`,
      null,
      null
    );

    console.log(`[Stripe] Chargeback processed for user ${user.id}: -${amountInCredits} credits`);
  }

  // ============================================
  // HELPERS
  // ============================================

  private getPlanFromPriceId(priceId: string): SubscriptionPlan {
    const proPriceIds = [
      this.proPriceIds.monthly,
      this.proPriceIds.yearly
    ];
    
    return proPriceIds.includes(priceId) ? 'pro' : 'free';
  }

  private async addCredits(
    userId: string,
    amount: number,
    type: 'daily_reset' | 'subscription' | 'topup' | 'consumption' | 'refund' | 'admin_adjustment' | 'chargeback',
    reason: string,
    stripePaymentIntentId: string | null,
    stripeInvoiceId: string | null
  ): Promise<void> {
    // Atomic credit update with transaction
    await this.db.transaction(async (tx) => {
      // Get current balance
      const [user] = await tx
        .select({ aiCredits: schema.users.aiCredits })
        .from(schema.users)
        .where(eq(schema.users.id, userId));

      const newBalance = Math.max(0, (user?.aiCredits ?? 0) + amount);

      // Update user balance
      await tx
        .update(schema.users)
        .set({ 
          aiCredits: newBalance,
          updatedAt: new Date()
        })
        .where(eq(schema.users.id, userId));

      // Record transaction
      await tx.insert(schema.creditTransactions).values({
        userId,
        type,
        amount,
        balanceAfter: newBalance,
        reason,
        stripePaymentIntentId,
        stripeInvoiceId
      });
    });
  }
}
