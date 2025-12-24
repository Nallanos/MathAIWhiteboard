import type { Express, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import type { MessageService } from '../services/message-service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const createMessageSchema = z.object({
  conversationId: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
  captureId: z.string().uuid().optional()
});

const editMessageSchema = z.object({
  content: z.string().min(1)
});

const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional()
});

interface Dependencies {
  app: Express;
  messageService: MessageService;
  authMiddleware: RequestHandler;
}

export function registerMessageRoutes({
  app,
  messageService,
  authMiddleware
}: Dependencies): void {
  // List conversations for a board (history)
  app.get('/api/boards/:boardId/conversations', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    try {
      const conversations = await messageService.listConversations(req.params.boardId, userId);
      res.json({ conversations });
    } catch (error) {
      console.error('Failed to list conversations', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Activate a previous conversation for a board
  app.post('/api/boards/:boardId/conversations/:conversationId/activate', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    try {
      const conversation = await messageService.setActiveConversation(
        req.params.boardId,
        userId,
        req.params.conversationId
      );
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      res.json({ conversation });
    } catch (error) {
      console.error('Failed to activate conversation', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get or create conversation for board
  app.get('/api/boards/:boardId/conversation', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    try {
      const conversation = await messageService.getOrCreateConversation(
        req.params.boardId,
        userId
      );
      res.json({ conversation });
    } catch (error) {
      console.error('Failed to get conversation', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Create new conversation (New Chat)
  app.post('/api/boards/:boardId/conversation', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    try {
      // Archive existing active conversations
      await messageService.archiveActiveConversations(req.params.boardId, userId);
      
      // Create new one
      const conversation = await messageService.getOrCreateConversation(
        req.params.boardId,
        userId
      );
      
      res.json({ conversation });
    } catch (error) {
      console.error('Failed to create conversation', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // List messages for a conversation
  app.get('/api/conversations/:id/messages', authMiddleware, async (req: Request, res: Response) => {
    try {
      const parsedQuery = listMessagesQuerySchema.safeParse(req.query);
      const limit = parsedQuery.success ? parsedQuery.data.limit : undefined;
      const messages = await messageService.getMessages(req.params.id, { limit });
      res.json({ messages });
    } catch (error) {
      console.error('Failed to list messages', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Create message
  app.post('/api/messages', authMiddleware, async (req: Request, res: Response) => {
    const payload = createMessageSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({ errors: payload.error.flatten() });
    }

    try {
      const message = await messageService.createMessage(
        payload.data.conversationId,
        payload.data.role,
        payload.data.content,
        payload.data.captureId
      );
      res.status(201).json({ message });
    } catch (error) {
      console.error('Failed to create message', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Edit message
  app.patch('/api/messages/:id', authMiddleware, async (req: Request, res: Response) => {
    const payload = editMessageSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({ errors: payload.error.flatten() });
    }

    try {
      const message = await messageService.editMessage(req.params.id, payload.data.content);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }
      res.json({ message });
    } catch (error) {
      console.error('Failed to edit message', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete message
  app.delete('/api/messages/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      await messageService.softDeleteMessage(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Failed to delete message', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
