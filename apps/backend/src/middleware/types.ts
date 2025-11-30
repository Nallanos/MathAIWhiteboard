/**
 * Middleware Types
 * 
 * Shared type definitions for Express middleware.
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Extended request with authenticated user information
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

/**
 * Standard middleware function signature
 */
export type MiddlewareFunction = (
  req: Request,
  res: Response,
  next: NextFunction
) => void | Promise<void> | Response | Promise<Response>;

/**
 * Middleware factory function signature
 */
export type MiddlewareFactory<T = void> = T extends void
  ? () => MiddlewareFunction
  : (options: T) => MiddlewareFunction;
