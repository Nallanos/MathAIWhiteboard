/**
 * Feature Gate Middleware
 * 
 * Middleware for checking user subscription features and credits.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { entitlementsCache } from '../lib/entitlements-cache.js';
import { PLAN_CONFIGS, canAccessFeature, type PlanFeatures, type SubscriptionStatus } from '@mathboard/shared';
import type { AuthenticatedRequest } from './types.js';

interface FeatureGateConfig {
  db: NodePgDatabase<typeof schema>;
}

interface UserEntitlements {
  userId: string;
  plan: 'free' | 'pro';
  status: SubscriptionStatus | null;
  aiCredits: number;
  features: PlanFeatures;
}

/**
 * Creates feature gating middleware factory
 */
export function createFeatureGate(config: FeatureGateConfig) {
  const { db } = config;

  /**
   * Load user entitlements (from cache or DB)
   */
  async function loadEntitlements(userId: string): Promise<UserEntitlements> {
    // Check cache first
    const cached = entitlementsCache.get(userId);
    if (cached) return cached;

    // Load from database
    const [user] = await db
      .select({
        id: schema.users.id,
        plan: schema.users.plan,
        subscriptionStatus: schema.users.subscriptionStatus,
        aiCredits: schema.users.aiCredits
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (!user) {
      throw new Error('User not found');
    }

    const entitlements: UserEntitlements = {
      userId: user.id,
      plan: user.plan,
      status: user.subscriptionStatus,
      aiCredits: user.aiCredits,
      features: PLAN_CONFIGS[user.plan].features
    };

    // Cache for future requests
    entitlementsCache.set(entitlements);

    return entitlements;
  }

  /**
   * Middleware that requires a specific feature
   */
  function requireFeature(feature: keyof PlanFeatures): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      try {
        const entitlements = await loadEntitlements(userId);
        
        const access = canAccessFeature(
          feature,
          {
            plan: entitlements.plan,
            status: entitlements.status,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            features: entitlements.features
          },
          {
            available: entitlements.aiCredits,
            resetAt: null,
            plan: entitlements.plan
          }
        );

        if (!access.hasAccess) {
          return res.status(403).json({
            error: 'Feature not available',
            reason: access.reason,
            upgradeRequired: access.upgradeRequired
          });
        }

        // Attach entitlements to request for downstream use
        (authReq as any).entitlements = entitlements;
        next();
      } catch (error) {
        console.error('[FeatureGate] Error checking feature access:', error);
        return res.status(500).json({ error: 'Failed to verify feature access' });
      }
    };
  }

  /**
   * Middleware that requires available AI credits
   */
  function requireCredits(amount: number = 1): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      try {
        const entitlements = await loadEntitlements(userId);

        if (entitlements.aiCredits < amount) {
          return res.status(402).json({
            error: 'Insufficient credits',
            available: entitlements.aiCredits,
            required: amount,
            upgradeRequired: entitlements.plan === 'free'
          });
        }

        // Attach entitlements to request
        (authReq as any).entitlements = entitlements;
        next();
      } catch (error) {
        console.error('[FeatureGate] Error checking credits:', error);
        return res.status(500).json({ error: 'Failed to verify credits' });
      }
    };
  }

  /**
   * Middleware that loads entitlements without blocking
   */
  function loadEntitlementsMiddleware(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;

      if (userId) {
        try {
          const entitlements = await loadEntitlements(userId);
          (authReq as any).entitlements = entitlements;
        } catch (error) {
          console.error('[FeatureGate] Error loading entitlements:', error);
        }
      }
      
      next();
    };
  }

  return {
    requireFeature,
    requireCredits,
    loadEntitlements: loadEntitlementsMiddleware,
    invalidateCache: (userId: string) => entitlementsCache.invalidate(userId)
  };
}
