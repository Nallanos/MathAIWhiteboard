/**
 * Error Handler Middleware
 * 
 * Global error handler for catching unhandled errors in routes.
 * Provides consistent error response format.
 */

import type { Request, Response, NextFunction } from 'express';
import type { MiddlewareFunction } from './types.js';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

/**
 * Create an error handler middleware
 * 
 * @returns Express error handling middleware
 */
export function createErrorHandler(): (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => void {
  return function errorHandler(
    err: AppError,
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    console.error('[Error]', err.message, err.stack);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
      error: message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  };
}
