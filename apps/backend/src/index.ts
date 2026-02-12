/**
 * Backend Entry Point
 * 
 * Bootstraps the Express server with middleware and routes.
 */

import { createServer } from 'node:http';
import dns from 'node:dns';
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
import { registerDiscordAuthRoutes } from './routes/discord-auth.js';
import { registerEmailRoutes } from './routes/email.js';
import { registerTutorRoutes } from './routes/tutor.js';
import { registerMeRoutes } from './routes/me.js';
import { registerLocaleRoutes } from './routes/locale.js';
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
import { StripeService } from './services/stripe-service.js';
import { CreditsService } from './services/credits-service.js';
import { EmailService } from './services/email-service.js';
import { shutdownPostHog } from './lib/posthog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Some hosting environments have flaky IPv6 egress; Google token verification fetches
// public certs from googleapis and can fail in prod while working in local dev.
// Prefer IPv4 to make outbound HTTPS more reliable.
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // ignore
}

async function bootstrap() {
  const config = loadEnv();
  console.log('Allowed CORS Origins:', config.corsOrigin);

  // If the environment sets an HTTP proxy (common in some PaaS networks), gaxios/google-auth-library
  // may route cert/JWKS fetches through it. Misconfigured proxies often manifest as ECONNREFUSED.
  // Ensure Google auth endpoints bypass proxies.
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (httpProxy || httpsProxy) {
    const googleNoProxyHosts = [
      'accounts.google.com',
      'google.com',
      'googleapis.com',
      'www.googleapis.com',
      'oauth2.googleapis.com',
    ];

    const mergeNoProxy = (current: string | undefined) => {
      const existing = (current || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const merged = Array.from(new Set([...existing, ...googleNoProxyHosts]));
      return merged.join(',');
    };

    process.env.NO_PROXY = mergeNoProxy(process.env.NO_PROXY);
    process.env.no_proxy = mergeNoProxy(process.env.no_proxy);

    console.log('[env] Proxy detected; setting NO_PROXY for Google auth hosts');
  }
  
  const app = express();
  // Trust reverse proxies (Railway/Cloudflare/Nginx) so req.ip uses X-Forwarded-For
  app.set('trust proxy', true);
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
  const creditsService = new CreditsService({ db });

  // Initialize Email service if configured
  const emailEnabled = Boolean(config.resendApiKey);
  const emailService = emailEnabled
    ? new EmailService(db, {
        resendApiKey: config.resendApiKey!,
        fromEmail: config.emailFromAddress!,
        fromName: config.emailFromName!,
        appUrl: config.frontendUrl
      })
    : null;

  if (!emailEnabled) {
    console.warn('[env] RESEND_API_KEY is not set: Email service will be disabled');
  }

  // Initialize Stripe service if configured
  const stripeEnabled = Boolean(config.stripeSecretKey && config.stripeWebhookSecret);
  const stripeService = stripeEnabled
    ? new StripeService({
        db,
        stripeSecretKey: config.stripeSecretKey!,
        stripeWebhookSecret: config.stripeWebhookSecret!,
        frontendUrl: config.frontendUrl,
        proPriceIds: {
          monthly: config.stripeProMonthlyPriceId || '',
          yearly: config.stripeProYearlyPriceId || ''
        }
      })
    : null;

  // Create middleware instances
  const authMiddleware = createAuthMiddleware(authService);
  const corsMiddleware = createCorsMiddleware({ allowedOrigins: config.corsOrigin });
  const requestLogger = createRequestLogger();
  const errorHandler = createErrorHandler();

  // Apply global middleware
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Google Identity Services opens a popup and uses cross-origin messaging.
      // Helmet's default COOP (same-origin) can break the flow and leave users stuck on
      // https://accounts.google.com/gsi/transform after selecting an account.
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      // Avoid forcing COEP, which can block third-party embeds needed by auth providers.
      crossOriginEmbedderPolicy: false,
      // Helmet's default CSP is very restrictive for a SPA and blocks Google Identity Services
      // script injection (https://accounts.google.com/gsi/client), making the OAuth button invisible.
      contentSecurityPolicy: false,
    })
  );
  app.use(corsMiddleware);
  app.use(requestLogger);
  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint for Railway
  app.get('/api/health', (_req, res) => {
    const build = {
      commit:
        process.env.RAILWAY_GIT_COMMIT_SHA ||
        process.env.GITHUB_SHA ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        undefined,
    };

    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Register routes
  registerLocaleRoutes({ app });
  registerAuthRoutes({ 
    app, 
    authService, 
    emailService, 
    googleClientId: config.googleClientId 
  });
  
  // Register Discord OAuth if configured
  if (config.discordClientId && config.discordClientSecret) {
    registerDiscordAuthRoutes({
      app,
      authService,
      emailService: emailService || undefined,
      discordConfig: {
        clientId: config.discordClientId,
        clientSecret: config.discordClientSecret,
        redirectUri: config.discordRedirectUri!
      }
    });
  } else {
    console.warn('[env] DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET is not set: Discord OAuth will be disabled');
  }

  // Register Email routes if configured
  if (emailService) {
    registerEmailRoutes({
      app,
      emailService,
      authService,
      db,
      resendWebhookSecret: config.resendWebhookSecret,
      frontendUrl: config.frontendUrl
    });
  }

  registerMeRoutes({ app, authMiddleware, db });
  registerCaptureRoutes({ app, service: captureService, config, authMiddleware });
  if (aiService) {
    registerAIRoutes({ app, authMiddleware, aiService });
  } else {
    app.get('/api/ai/models', authMiddleware, async (_req: express.Request, res: express.Response) => {
      return res.status(200).json({
        freeModel: 'gemini-3-flash-preview',
        premiumModel: 'gemini-3-pro',
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
  
  // Register Stripe routes if configured
  if (stripeService) {
    registerStripeRoutes({ app, authMiddleware, stripeService, creditsService, db });
  } else {
    console.warn('[env] STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is not set: Stripe routes will be disabled');
    // Provide basic credits endpoint even without Stripe
    app.get('/api/me/credits', authMiddleware, async (req: express.Request, res: express.Response) => {
      try {
        const authReq = req as any;
        const credits = await creditsService.getBalance(authReq.user.id);
        return res.status(200).json(credits);
      } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch credits' });
      }
    });
  }

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
  await new Promise<void>((resolve, reject) => {
    const onError = (e: unknown) => {
      server.off('listening', onListening);
      reject(e);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '0.0.0.0');
  });
  console.log(`Backend listening on 0.0.0.0:${port}`);
  console.log('Capture Limits:', {
    image: config.captureImageMaxBytes,
    scene: config.captureSceneMaxBytes
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start backend', error);

  // If we crash during boot on Railway, the edge will report 502/connection refused.
  // Start a tiny fallback server so we can still see the failure reason via HTTP.
  try {
    const candidates = [
      process.env.PORT,
      process.env.RAILWAY_PORT,
      process.env.RAILWAY_TCP_PROXY_PORT,
      process.env.NIXPACKS_PORT,
      process.env.APP_PORT,
    ].filter(Boolean) as string[];

    let port = 4000;
    for (const raw of candidates) {
      const n = Number.parseInt(String(raw), 10);
      if (Number.isFinite(n) && n > 0) {
        port = n;
        break;
      }
    }

    const app = express();
    app.get('/api/health', (_req, res) => {
      res.status(500).json({
        status: 'boot_failed',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    });

    const server = createServer(app);
    server.listen(port, '0.0.0.0', () => {
      console.error(`Fallback health server listening on 0.0.0.0:${port}`);
    });
  } catch (fallbackError) {
    console.error('Fallback server failed', fallbackError);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  await shutdownPostHog();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await shutdownPostHog();
  process.exit(0);
});
