/**
 * Entitlements Cache
 * 
 * In-memory cache for user subscription entitlements.
 * For production with multiple instances, replace with Redis.
 */

import type { SubscriptionPlan, SubscriptionStatus, PlanFeatures } from '@mathboard/shared';
import { PLAN_CONFIGS } from '@mathboard/shared';

interface UserEntitlements {
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus | null;
  aiCredits: number;
  features: PlanFeatures;
  cachedAt: number;
}

/**
 * In-memory cache for user entitlements
 * 
 * For production with multiple instances, replace with Redis:
 * - Key: `entitlements:${userId}`
 * - TTL: 60 seconds
 */
export class EntitlementsCache {
  private cache: Map<string, UserEntitlements> = new Map();
  private readonly ttlMs: number;

  constructor(ttlMs: number = 60_000) { // 1 minute default
    this.ttlMs = ttlMs;
  }

  get(userId: string): UserEntitlements | null {
    const entry = this.cache.get(userId);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.cache.delete(userId);
      return null;
    }
    
    return entry;
  }

  set(data: Omit<UserEntitlements, 'cachedAt'>): void {
    this.cache.set(data.userId, {
      ...data,
      cachedAt: Date.now()
    });
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Invalidate cache when subscription changes (called from webhook handler)
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats for monitoring
   */
  getStats(): { size: number; ttlMs: number } {
    return {
      size: this.cache.size,
      ttlMs: this.ttlMs
    };
  }
}

// Singleton instance
export const entitlementsCache = new EntitlementsCache();
