import type { Express, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import type { BoardService } from '../services/board-service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const createBoardSchema = z.object({
  title: z.string().min(1).default('Untitled Board')
});

const updateBoardSchema = z.object({
  scene: z.object({
    elements: z.array(z.unknown()),
    appState: z.record(z.unknown()),
    files: z.record(z.unknown()).optional()
  }),
  thumbnailUrl: z.string().optional()
});

interface Dependencies {
  app: Express;
  boardService: BoardService;
  authMiddleware: RequestHandler;
}

export function registerBoardRoutes({
  app,
  boardService,
  authMiddleware
}: Dependencies): void {
  // List boards
  app.get('/api/boards', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    try {
      const boards = await boardService.listBoards(userId);
      res.json({ boards });
    } catch (error) {
      console.error('Failed to list boards', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Create board
  app.post('/api/boards', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const payload = createBoardSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({ errors: payload.error.flatten() });
    }

    try {
      const board = await boardService.createBoard(userId, payload.data.title);
      res.status(201).json({ board });
    } catch (error) {
      console.error('Failed to create board', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get board
  app.get('/api/boards/:id', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    try {
      const board = await boardService.getBoard(req.params.id, userId);
      if (!board) {
        return res.status(404).json({ error: 'Board not found' });
      }
      res.json({ board });
    } catch (error) {
      console.error('Failed to get board', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update board scene (Auto-save)
  app.put('/api/boards/:id', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const payload = updateBoardSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({ errors: payload.error.flatten() });
    }

    try {
      const board = await boardService.updateBoardScene(
        req.params.id,
        userId,
        payload.data.scene,
        payload.data.thumbnailUrl
      );
      if (!board) {
        return res.status(404).json({ error: 'Board not found' });
      }
      res.json({ board });
    } catch (error) {
      console.error('Failed to update board', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete board
  app.delete('/api/boards/:id', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    try {
      const board = await boardService.getBoard(req.params.id, userId);
      if (!board) {
        return res.status(404).json({ error: 'Board not found' });
      }
      
      await boardService.deleteBoard(req.params.id, userId);
      res.status(204).send();
    } catch (error) {
      console.error('Failed to delete board', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
