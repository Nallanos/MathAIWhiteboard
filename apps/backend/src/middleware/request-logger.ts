/**
 * Request Logger Middleware
 * 
 * Logs incoming HTTP requests for debugging and monitoring.
 */

import type { Request, Response, NextFunction } from 'express';
import type { MiddlewareFunction } from './types.js';

/**
 * Create a request logger middleware
 * 
 * @returns Express middleware function
 */
export function createRequestLogger(): MiddlewareFunction {
  return function requestLogger(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const log = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;
      
      if (res.statusCode >= 400) {
        console.error(log);
      } else if (process.env.NODE_ENV === 'development') {
        console.log(log);
      }
    });

    next();
  };
}
