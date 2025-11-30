/**
 * Validate Body Middleware
 * 
 * Validates request body against a Zod schema.
 * Returns 400 Bad Request if validation fails.
 */

import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import type { MiddlewareFunction } from './types.js';

/**
 * Create a body validation middleware
 * 
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export function createBodyValidator(schema: ZodSchema): MiddlewareFunction {
  return function validateBody(req: Request, res: Response, next: NextFunction) {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }

    // Replace body with parsed data (includes defaults, transforms)
    req.body = result.data;
    next();
  };
}
