import type { Express, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import type { AIPromptPayload } from '@mathboard/shared';
import type { AiService } from '../services/ai-service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { InsufficientCreditsError, ModelUnavailableError } from '../services/ai-service.js';

const thinkingConfigSchema = z.union([
  z.object({ mode: z.literal('auto') }),
  z.object({ mode: z.literal('level'), level: z.enum(['low', 'medium', 'high']) }),
  z.object({ mode: z.literal('budget'), budget: z.number().int().min(1).max(10000) })
]);

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
  model: z.string().optional(),
  thinking: thinkingConfigSchema.optional()
});

interface Dependencies {
  app: Express;
  authMiddleware: RequestHandler;
  aiService: AiService;
}

function writeSSE(res: Response, event: any): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  if (process.env.DEBUG_SSE === '1') {
    console.log(
      '[SSE] Sending event:',
      event.type,
      event.type === 'delta' ? `(${event.text?.length || 0} chars)` : JSON.stringify(event).slice(0, 100)
    );
  }
  res.write(data);
  // If a proxy/compression layer is present, flush immediately.
  const anyRes = res as any;
  if (typeof anyRes.flush === 'function') {
    try {
      anyRes.flush();
    } catch {
      // ignore
    }
  }
}

export function registerAIRoutes({ app, authMiddleware, aiService }: Dependencies): void {
  app.get('/api/ai/models', authMiddleware, async (_req: Request, res: Response) => {
    try {
      const result = await aiService.getGoogleModelAvailability();
      return res.status(200).json(result);
    } catch (error) {
      console.error('Failed to list AI models', error);
      return res.status(200).json({
        freeModel: 'gemini-3-flash-preview',
        premiumModel: 'gemini-3-pro',
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

  app.post('/api/ai/analyze/stream', authMiddleware, async (req: Request, res: Response) => {
    const payload = analyzeSchema.safeParse(req.body);

    if (!payload.success) {
      return res.status(400).json({ errors: payload.error.flatten() });
    }

    const body: AIPromptPayload = payload.data;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Hint reverse proxies (nginx) to not buffer SSE.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send an initial comment line so clients/proxies see bytes early.
    res.write(':ok\n\n');

    let aborted = false;
    let keepAlive: NodeJS.Timeout | null = null;
    const markAborted = (reason: string) => {
      if (aborted) return;
      aborted = true;
      console.log('[SSE] Client disconnected:', reason);
      if (keepAlive) clearInterval(keepAlive);
    };

    // IMPORTANT: `req.on('close')` may fire after the request body is fully read,
    // which would prematurely mark the SSE connection as aborted.
    req.on('aborted', () => markAborted('req.aborted'));
    res.on('close', () => markAborted('res.close'));

    // Keep-alive pings help prevent idle buffering/timeouts in some proxies.
    keepAlive = setInterval(() => {
      if (aborted) return;
      try {
        res.write(':ping\n\n');
      } catch (e) {
        markAborted('ping write failed');
      }
    }, 15000);

    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      
      writeSSE(res, { type: 'status', stage: 'capture', message: 'Preparing...' });
      
      if (aborted) return;
      
      const result = await aiService.analyzeStream(body, userId, (event) => {
        if (!aborted) {
          writeSSE(res, event);
        }
      });

      if (!aborted) {
        writeSSE(res, { 
          type: 'done', 
          messageId: result.messageId,
          model: result.model, 
          provider: result.provider 
        });
        if (keepAlive) clearInterval(keepAlive);
        res.end();
      }
    } catch (error) {
      if (aborted) return;
      
      if (error instanceof InsufficientCreditsError) {
        writeSSE(res, { type: 'error', error: error.message });
      } else if (error instanceof ModelUnavailableError) {
        writeSSE(res, { type: 'error', error: error.message });
      } else {
        console.error('AI streaming failed', error);
        writeSSE(res, { type: 'error', error: 'AI analysis failed' });
      }
      if (keepAlive) clearInterval(keepAlive);
      res.end();
    }
  });
}
