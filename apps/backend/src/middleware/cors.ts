/**
 * CORS Middleware
 * 
 * Configures Cross-Origin Resource Sharing for the API.
 */

import cors from 'cors';
import type { CorsOptions } from 'cors';

type CorsOrigin = string | RegExp | (string | RegExp)[];

interface CorsConfig {
  allowedOrigins: CorsOrigin;
}

/**
 * Create a CORS middleware with configured origins
 * 
 * @param config - CORS configuration options
 * @returns Configured cors middleware
 */
export function createCorsMiddleware(config: CorsConfig) {
  const options: CorsOptions = {
    origin: config.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };

  return cors(options);
}
