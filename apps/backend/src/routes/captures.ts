import type { Express, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import type { CreateCapturePayload } from '@mathboard/shared';
import type { EnvConfig } from '../lib/env.js';
import { CaptureService } from '../services/capture-service.js';

const dataUrlRegex = /^data:image\/png;base64,/i;

const sceneSchema = z.object({
  elements: z.array(z.unknown()),
  appState: z.record(z.unknown()),
  files: z.record(z.unknown())
});

const captureSchema = z.object({
  conversationId: z.string().uuid(),
  boardId: z.string().min(1),
  scene: sceneSchema,
  image: z.object({
    dataUrl: z.string().regex(dataUrlRegex),
    width: z.number().int().positive().max(4096),
    height: z.number().int().positive().max(4096),
    byteSize: z.number().int().positive()
  })
});

interface Dependencies {
  app: Express;
  service: CaptureService;
  config: EnvConfig;
  authMiddleware: RequestHandler;
}

export function registerCaptureRoutes({ app, service, config, authMiddleware }: Dependencies) {
  app.post('/api/captures', authMiddleware, async (req: Request, res: Response) => {
    const result = captureSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    const payload = result.data as CreateCapturePayload;

    if (payload.image.byteSize > config.captureImageMaxBytes) {
      return res.status(413).json({ error: 'Image payload too large' });
    }

    const sceneSize = Buffer.byteLength(JSON.stringify(payload.scene), 'utf8');
    if (sceneSize > config.captureSceneMaxBytes) {
      return res.status(413).json({ error: 'Scene payload too large' });
    }

    try {
      // @ts-ignore - user is attached by authMiddleware
      const stored = await service.save(req.user!.id, payload);
      return res.status(201).json({ captureId: stored.id, createdAt: stored.createdAt });
    } catch (error) {
      console.error('Failed to persist capture', error);
      return res.status(500).json({ error: 'Unable to store capture' });
    }
  });
}
