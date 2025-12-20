/**
 * Backend Entry Point
 * 
 * Bootstraps the Express server with middleware and routes.
 */

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { registerAIRoutes } from './routes/ai.js';
import { registerBoardRoutes } from './routes/boards.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerStripeRoutes } from './routes/stripe.js';
import { registerCaptureRoutes } from './routes/captures.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerTutorRoutes } from './routes/tutor.js';
import { registerMeRoutes } from './routes/me.js';
import { setupCollaboration } from './socket/collaboration.js';
import { loadEnv } from './lib/env.js';
import {
  createAuthMiddleware,
  createCorsMiddleware,
  createRequestLogger,
  createErrorHandler,
} from './middleware/index.js';
import { getDb } from './db/client.js';
import { CaptureService } from './services/capture-service.js';
import { AiService } from './services/ai-service.js';
import { BoardService } from './services/board-service.js';
import { MessageService } from './services/message-service.js';
import { AuthService } from './services/auth-service.js';
import { shutdownPostHog } from './lib/posthog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function bootstrap() {
  const config = loadEnv();
  console.log('Allowed CORS Origins:', config.corsOrigin);
  
  const app = express();
  const db = getDb(config);

  // Initialize services
  const captureService = new CaptureService({
    db,
    baseDir: config.captureStorageDir
  });

  const aiEnabled = Boolean(config.geminiKey);
  const aiService = aiEnabled
    ? new AiService({
        db,
        geminiKey: config.geminiKey,
        openaiKey: config.openaiKey,
        anthropicKey: config.anthropicKey,
      })
    : null;

  const boardService = new BoardService({ db });
  const messageService = new MessageService({ db });
  const authService = new AuthService(db);

  // Create middleware instances
  const authMiddleware = createAuthMiddleware(authService);
  const corsMiddleware = createCorsMiddleware({ allowedOrigins: config.corsOrigin });
  const requestLogger = createRequestLogger();
  const errorHandler = createErrorHandler();

  // Apply global middleware
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
  app.use(corsMiddleware);
  app.use(requestLogger);
  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint for Railway
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Register routes
  registerAuthRoutes({ app, authService, googleClientId: config.googleClientId });
  registerMeRoutes({ app, authMiddleware, db });
  registerCaptureRoutes({ app, service: captureService, config, authMiddleware });
  if (aiService) {
    registerAIRoutes({ app, authMiddleware, aiService });
  } else {
    app.get('/api/ai/models', authMiddleware, async (_req: express.Request, res: express.Response) => {
      return res.status(200).json({
        freeModel: 'gemini-2.0-flash',
        premiumModel: 'gemini-3-flash-preview',
        premiumAvailable: false,
      });
    });

    app.post('/api/ai/analyze', authMiddleware, async (_req: express.Request, res: express.Response) => {
      return res.status(503).json({ error: 'AI is disabled (missing GEMINI_API_KEY)' });
    });
  }
  registerBoardRoutes({ app, boardService, authMiddleware });
  registerMessageRoutes({ app, messageService, authMiddleware });
  registerTutorRoutes({ app, authMiddleware, db });
  registerStripeRoutes(app);

  // Serve static frontend files in production
  const publicPath = join(__dirname, '..', 'public');
  app.use(express.static(publicPath));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(join(publicPath, 'index.html'));
  });

  // Error handler must be last
  app.use(errorHandler);

  // Setup WebSocket server
  const server = createServer(app);
  const io = new Server(server, {
    cors: { origin: config.corsOrigin, credentials: true }
  });
  setupCollaboration(io);

  // Start server
  const port = config.port;
  server.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });
  console.log('Capture Limits:', {
    image: config.captureImageMaxBytes,
    scene: config.captureSceneMaxBytes
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start backend', error);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await shutdownPostHog();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await shutdownPostHog();
  process.exit(0);
});
