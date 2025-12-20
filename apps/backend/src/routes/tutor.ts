import type { Express, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { normalizeTutorState, safeParseTutorPlan } from '../ai/tutor-schemas.js';

type Database = NodePgDatabase<typeof schema>;

const patchSchema = z.object({
  completedStepIds: z.array(z.string().min(1)).optional(),
  currentStepId: z.string().min(1).nullable().optional(),
  status: z.enum(['active', 'completed', 'abandoned']).optional()
});

interface Dependencies {
  app: Express;
  authMiddleware: RequestHandler;
  db: Database;
}

export function registerTutorRoutes({ app, authMiddleware, db }: Dependencies): void {
  // Get tutor session for a conversation
  app.get('/api/tutor/conversations/:conversationId/session', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const conversationId = req.params.conversationId;

    const [session] = await db
      .select()
      .from(schema.tutoringSessions)
      .where(and(eq(schema.tutoringSessions.conversationId, conversationId), eq(schema.tutoringSessions.userId, userId)))
      .limit(1);

    if (!session) {
      return res.json({ session: null });
    }

    const planParsed = safeParseTutorPlan(session.plan ?? null);
    const state = normalizeTutorState(session.state ?? null);

    // Self-heal: if plan is invalid, clear it; if state is invalid, normalize it.
    const nextPlan = planParsed.ok ? planParsed.plan : null;
    const needsUpdate = (!planParsed.ok && session.plan != null) || JSON.stringify(state) !== JSON.stringify(session.state ?? null);

    if (needsUpdate) {
      const [updated] = await db
        .update(schema.tutoringSessions)
        .set({
          plan: nextPlan,
          state,
          updatedAt: new Date()
        })
        .where(and(eq(schema.tutoringSessions.id, session.id), eq(schema.tutoringSessions.userId, userId)))
        .returning();

      return res.json({
        session: {
          ...updated,
          plan: nextPlan,
          state
        }
      });
    }

    return res.json({
      session: {
        ...session,
        plan: nextPlan,
        state
      }
    });
  });

  // Patch tutor session state (student-driven checking)
  app.patch('/api/tutor/conversations/:conversationId/session', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const conversationId = req.params.conversationId;

    const payload = patchSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({ errors: payload.error.flatten() });
    }

    const [existing] = await db
      .select()
      .from(schema.tutoringSessions)
      .where(and(eq(schema.tutoringSessions.conversationId, conversationId), eq(schema.tutoringSessions.userId, userId)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Tutor session not found' });
    }

    const existingState = normalizeTutorState(existing.state ?? null);
    const nextState = normalizeTutorState({
      ...existingState,
      ...(payload.data.completedStepIds ? { completedStepIds: payload.data.completedStepIds } : null),
      ...(payload.data.currentStepId !== undefined ? { currentStepId: payload.data.currentStepId } : null)
    });

    const status = payload.data.status ?? existing.status;

    const [updated] = await db
      .update(schema.tutoringSessions)
      .set({
        state: nextState,
        status,
        updatedAt: new Date(),
        completedAt: status === 'completed' ? new Date() : existing.completedAt
      })
      .where(and(eq(schema.tutoringSessions.id, existing.id), eq(schema.tutoringSessions.userId, userId)))
      .returning();

    return res.json({ session: updated });
  });
}
