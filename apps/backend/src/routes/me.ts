import type { Express, Request, Response, RequestHandler } from 'express';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { sql } from 'drizzle-orm';

type Database = NodePgDatabase<typeof schema>;

interface Dependencies {
  app: Express;
  authMiddleware: RequestHandler;
  db: Database;
}

export function registerMeRoutes({ app, authMiddleware, db }: Dependencies): void {
  app.get('/api/me', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user!.id;

    // Lazy daily credits reset (UTC day boundary)
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    await db
      .update(schema.users)
      .set({
        aiCredits: 25,
        aiCreditsResetAt: now
      })
      .where(and(eq(schema.users.id, userId), sql<boolean>`${schema.users.aiCreditsResetAt} < ${todayUtc}`));

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId)
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        aiCredits: user.aiCredits
      }
    });
  });
}
