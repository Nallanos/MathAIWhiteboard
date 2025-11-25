import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { registerAIRoutes } from './routes/ai.js';
import { registerBoardRoutes } from './routes/boards.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerStripeRoutes } from './routes/stripe.js';
import { registerCaptureRoutes } from './routes/captures.js';
import { registerAuthRoutes } from './routes/auth.js';
import { setupCollaboration } from './socket/collaboration.js';
import { loadEnv } from './lib/env.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { getDb } from './db/client.js';
import { CaptureService } from './services/capture-service.js';
import { AiService } from './services/ai-service.js';
import { BoardService } from './services/board-service.js';
import { MessageService } from './services/message-service.js';
import { AuthService } from './services/auth-service.js';

async function bootstrap() {
  const config = loadEnv();
  console.log('Allowed CORS Origins:', config.corsOrigin);
  const app = express();
  const db = getDb(config);

  const captureService = new CaptureService({
    db,
    baseDir: config.captureStorageDir
  });

  const aiService = new AiService({
    db,
    geminiKey: config.geminiKey,
    openaiKey: config.openaiKey,
    anthropicKey: config.anthropicKey
  });

  const boardService = new BoardService({ db });
  const messageService = new MessageService({ db });
  const authService = new AuthService(db);

  const authMiddleware = createAuthMiddleware(authService);

  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '10mb' }));

  registerAuthRoutes({ app, authService });
  registerCaptureRoutes({ app, service: captureService, config, authMiddleware });
  registerAIRoutes({ app, authMiddleware, aiService });
  registerBoardRoutes({ app, boardService, authMiddleware });
  registerMessageRoutes({ app, messageService, authMiddleware });
  registerStripeRoutes(app);

  const server = createServer(app);
  const io = new Server(server, {
    cors: { origin: config.corsOrigin, credentials: true }
  });
  setupCollaboration(io);

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
