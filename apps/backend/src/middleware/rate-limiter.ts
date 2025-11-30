/**
 * Rate Limiter Middleware
 * 
 * Limits the number of requests from a single IP address.
 * Helps prevent abuse and DDoS attacks.
 */

import type { Request, Response, NextFunction } from 'express';
import type { MiddlewareFunction } from './types.js';

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Create a rate limiter middleware
 * 
 * @param config - Rate limit configuration
 * @returns Express middleware function
 */
export function createRateLimiter(config: RateLimitConfig): MiddlewareFunction {
  const { windowMs, maxRequests } = config;

  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }, windowMs);

  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    let entry = rateLimitStore.get(ip);
    
    if (!entry || entry.resetTime < now) {
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(ip, entry);
      return next();
    }

    entry.count++;
    
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter,
      });
    }

    next();
  };
}
