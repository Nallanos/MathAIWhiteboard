import type { Express, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import type { AIPromptPayload } from '@mathboard/shared';
import type { AiService } from '../services/ai-service.js';

const analyzeSchema = z.object({
  boardId: z.string(),
  conversationId: z.string().uuid(),
  prompt: z.string().min(1),
  locale: z.enum(['fr', 'en']).default('fr'),
  mode: z.enum(['auto', 'manual']).default('auto'),
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
  app.post('/api/ai/analyze', authMiddleware, async (req: Request, res: Response) => {
    const payload = analyzeSchema.safeParse(req.body);

    if (!payload.success) {
      return res.status(400).json({ errors: payload.error.flatten() });
    }

    const body: AIPromptPayload = payload.data;

    try {
      const result = await aiService.analyze(body);
      return res.status(200).json(result);
    } catch (error) {
      console.error('AI analysis failed', error);
      return res.status(502).json({ error: 'AI analysis failed' });
    }
  });
}
