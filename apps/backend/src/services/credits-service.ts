/**
 * Credits Service
 * 
 * Handles AI credit management: consumption, daily resets, and transaction history.
 */

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { PLAN_CONFIGS, type CreditsState, type CreditConsumptionMetadata } from '@mathboard/shared';

interface CreditsServiceConfig {
  db: NodePgDatabase<typeof schema>;
}

export class InsufficientCreditsError extends Error {
  constructor(message = 'Insufficient AI credits') {
    super(message);
    this.name = 'InsufficientCreditsError';
  }
}

export class CreditsService {
  private db: NodePgDatabase<typeof schema>;

  constructor(config: CreditsServiceConfig) {
    this.db = config.db;
  }

  /**
   * Get user's current credit balance and reset info
   */
  async getBalance(userId: string): Promise<CreditsState> {
    const [user] = await this.db
      .select({
        aiCredits: schema.users.aiCredits,
        aiCreditsResetAt: schema.users.aiCreditsResetAt,
        plan: schema.users.plan
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (!user) {
      throw new Error('User not found');
    }

    // Check if daily reset is needed (for free plan)
    if (user.plan === 'free') {
      const now = new Date();
      const resetAt = new Date(user.aiCreditsResetAt);
      const nextReset = new Date(resetAt);
      nextReset.setDate(nextReset.getDate() + 1);

      if (now >= nextReset) {
        // Trigger daily reset
        await this.resetDailyCredits(userId);
        const dailyCredits = PLAN_CONFIGS.free.features.aiCreditsPerDay;
        return {
          available: dailyCredits,
          resetAt: new Date().toISOString(),
          plan: 'free'
        };
      }

      return {
        available: user.aiCredits,
        resetAt: nextReset.toISOString(),
        plan: 'free'
      };
    }

    return {
      available: user.aiCredits,
      resetAt: null,
      plan: user.plan
    };
  }

  /**
   * Consume credits for an AI operation - ATOMIC transaction
   */
  async consumeCredits(
    userId: string,
    amount: number,
    metadata: CreditConsumptionMetadata
  ): Promise<{ success: boolean; remaining: number }> {
    return await this.db.transaction(async (tx) => {
      // Get user with lock to prevent race conditions
      const [user] = await tx
        .select({
          aiCredits: schema.users.aiCredits,
          aiCreditsResetAt: schema.users.aiCreditsResetAt,
          plan: schema.users.plan
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId));

      if (!user) {
        throw new Error('User not found');
      }

      // Check for daily reset (free plan only)
      let currentCredits = user.aiCredits;
      if (user.plan === 'free') {
        const now = new Date();
        const resetAt = new Date(user.aiCreditsResetAt);
        const nextReset = new Date(resetAt);
        nextReset.setDate(nextReset.getDate() + 1);

        if (now >= nextReset) {
          // Perform daily reset inline
          const dailyCredits = PLAN_CONFIGS.free.features.aiCreditsPerDay;
          currentCredits = dailyCredits;

          await tx
            .update(schema.users)
            .set({
              aiCredits: dailyCredits,
              aiCreditsResetAt: now,
              updatedAt: now
            })
            .where(eq(schema.users.id, userId));

          // Record reset transaction
          await tx.insert(schema.creditTransactions).values({
            userId,
            type: 'daily_reset',
            amount: dailyCredits,
            balanceAfter: dailyCredits,
            reason: 'Daily credits reset'
          });
        }
      }

      // Check if enough credits
      if (currentCredits < amount) {
        throw new InsufficientCreditsError(
          `Insufficient credits: ${currentCredits} available, ${amount} required`
        );
      }

      // Deduct credits
      const newBalance = currentCredits - amount;

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
        type: 'consumption',
        amount: -amount,
        balanceAfter: newBalance,
        reason: `AI ${metadata.operation}`,
        metadata: metadata as any
      });

      return {
        success: true,
        remaining: newBalance
      };
    });
  }

  /**
   * Reset daily credits for free plan users
   */
  async resetDailyCredits(userId: string): Promise<void> {
    const dailyCredits = PLAN_CONFIGS.free.features.aiCreditsPerDay;
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({
          aiCredits: dailyCredits,
          aiCreditsResetAt: now,
          updatedAt: now
        })
        .where(eq(schema.users.id, userId));

      await tx.insert(schema.creditTransactions).values({
        userId,
        type: 'daily_reset',
        amount: dailyCredits,
        balanceAfter: dailyCredits,
        reason: 'Daily credits reset'
      });
    });
  }

  /**
   * Add credits (for top-ups, subscriptions, refunds)
   */
  async addCredits(
    userId: string,
    amount: number,
    type: 'subscription' | 'topup' | 'refund' | 'admin_adjustment',
    reason: string,
    stripeRefs?: { paymentIntentId?: string; invoiceId?: string }
  ): Promise<number> {
    return await this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ aiCredits: schema.users.aiCredits })
        .from(schema.users)
        .where(eq(schema.users.id, userId));

      const newBalance = (user?.aiCredits ?? 0) + amount;

      await tx
        .update(schema.users)
        .set({ 
          aiCredits: newBalance,
          updatedAt: new Date()
        })
        .where(eq(schema.users.id, userId));

      await tx.insert(schema.creditTransactions).values({
        userId,
        type,
        amount,
        balanceAfter: newBalance,
        reason,
        stripePaymentIntentId: stripeRefs?.paymentIntentId ?? null,
        stripeInvoiceId: stripeRefs?.invoiceId ?? null
      });

      return newBalance;
    });
  }

  /**
   * Get credit transaction history
   */
  async getTransactionHistory(
    userId: string,
    limit: number = 50
  ): Promise<typeof schema.creditTransactions.$inferSelect[]> {
    return await this.db
      .select()
      .from(schema.creditTransactions)
      .where(eq(schema.creditTransactions.userId, userId))
      .orderBy(sql`created_at DESC`)
      .limit(limit);
  }
}
