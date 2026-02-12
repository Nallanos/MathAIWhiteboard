/**
 * Middleware Index
 * 
 * Exports all middleware factories for use in route configuration.
 * Each middleware is in its own file following AdonisJS conventions.
 */

// Types
export type { AuthenticatedRequest, MiddlewareFunction, MiddlewareFactory } from './types.js';

// Auth middleware
export { createAuthMiddleware } from './auth.js';

// CORS middleware
export { createCorsMiddleware } from './cors.js';

// Error handling middleware
export { createErrorHandler } from './error-handler.js';

// Request logging middleware
export { createRequestLogger } from './request-logger.js';

// Rate limiting middleware
export { createRateLimiter } from './rate-limiter.js';

// Body validation middleware
export { createBodyValidator } from './validate-body.js';

// Feature gating middleware
export { createFeatureGate } from './feature-gate.js';
