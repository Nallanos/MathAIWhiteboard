/**
 * Auth Middleware
 * 
 * Verifies JWT token and attaches user information to the request.
 * Returns 401 Unauthorized if token is missing or invalid.
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthService } from '../services/auth-service.js';
import type { AuthenticatedRequest, MiddlewareFunction } from './types.js';

export { AuthenticatedRequest };

/**
 * Create an authentication middleware instance
 * 
 * @param authService - The auth service for token verification
 * @returns Express middleware function
 */
export function createAuthMiddleware(authService: AuthService): MiddlewareFunction {
  return function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const payload = authService.verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    (req as AuthenticatedRequest).user = { id: payload.userId };
    next();
  };
}
