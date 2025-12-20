import type { Express, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import type { AIPromptPayload } from '@mathboard/shared';
import type { AiService } from '../services/ai-service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { InsufficientCreditsError, ModelUnavailableError } from '../services/ai-service.js';

const analyzeSchema = z.object({
  boardId: z.string(),
  conversationId: z.string().uuid(),
  prompt: z.string().min(1),
  locale: z.enum(['fr', 'en']).default('fr'),
  mode: z.enum(['auto', 'manual']).default('auto'),
  chatMode: z.enum(['board', 'tutor']).default('board'),
  captureId: z.string().uuid().nullable(),
  boardVersion: z.number().int().nonnegative().optional(),
  provider: z.enum(['google', 'openai', 'anthropic']).optional(),
  model: z.string().optional()
});

interface Dependencies {
  app: Express;
  authMiddleware: RequestHandler;
  aiService: AiService;
}

export function registerAIRoutes({ app, authMiddleware, aiService }: Dependencies): void {
  app.get('/api/ai/models', authMiddleware, async (_req: Request, res: Response) => {
    try {
      const result = await aiService.getGoogleModelAvailability();
      return res.status(200).json(result);
    } catch (error) {
      console.error('Failed to list AI models', error);
      return res.status(200).json({
        freeModel: 'gemini-2.0-flash',
        premiumModel: 'gemini-3-flash-preview',
        premiumAvailable: false
      });
    }
  });

  app.post('/api/ai/analyze', authMiddleware, async (req: Request, res: Response) => {
    const payload = analyzeSchema.safeParse(req.body);

    if (!payload.success) {
      return res.status(400).json({ errors: payload.error.flatten() });
    }

    const body: AIPromptPayload = payload.data;

    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const result = await aiService.analyze(body, userId);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return res.status(402).json({ error: error.message });
      }
      if (error instanceof ModelUnavailableError) {
        return res.status(400).json({ error: error.message });
      }
      console.error('AI analysis failed', error);
      return res.status(502).json({ error: 'AI analysis failed' });
    }
  });
}
