import type { Request, Response, NextFunction } from 'express';
import type { AuthService } from '../services/auth-service.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

export function createAuthMiddleware(authService: AuthService) {
  return function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = authService.verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    (req as AuthenticatedRequest).user = { id: payload.userId };
    next();
  };
}
