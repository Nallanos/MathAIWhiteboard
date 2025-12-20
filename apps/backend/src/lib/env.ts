import 'dotenv/config';

export interface EnvConfig {
  port: number;
  corsOrigin: string | RegExp | (string | RegExp)[];
  geminiKey: string;
  openaiKey?: string;
  anthropicKey?: string;
  stripeSecretKey?: string;
  googleClientId: string;
  databaseUrl: string;
  captureStorageDir: string;
  captureImageMaxBytes: number;
  captureSceneMaxBytes: number;
}

export function loadEnv(): EnvConfig {
  const {
    PORT,
    CORS_ORIGIN = 'http://localhost:5173',
    GEMINI_API_KEY = '',
    OPENAI_API_KEY,
    ANTHROPIC_API_KEY,
    STRIPE_SECRET_KEY,
    GOOGLE_CLIENT_ID = '',
    DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/whiteboardai',
    CAPTURE_STORAGE_DIR = './data/captures',
    CAPTURE_IMAGE_MAX_BYTES = '5242880',
    CAPTURE_SCENE_MAX_BYTES = '1048576'
  } = process.env;

  const resolvePort = () => {
    const candidates = [
      PORT,
      process.env.RAILWAY_PORT,
      process.env.RAILWAY_TCP_PROXY_PORT,
      process.env.NIXPACKS_PORT,
      process.env.APP_PORT,
    ].filter(Boolean) as string[];

    for (const raw of candidates) {
      const n = Number.parseInt(String(raw), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 8080;
  };

  const port = resolvePort();

  if (!GEMINI_API_KEY) {
    console.warn('[env] GEMINI_API_KEY is not set: AI routes will be disabled');
  }

  if (!GOOGLE_CLIENT_ID) {
    console.warn('[env] GOOGLE_CLIENT_ID is not set: Google OAuth will be unavailable');
  }

  return {
    port,
    corsOrigin: CORS_ORIGIN.includes(',') ? CORS_ORIGIN.split(',') : CORS_ORIGIN,
    geminiKey: GEMINI_API_KEY,
    openaiKey: OPENAI_API_KEY,
    anthropicKey: ANTHROPIC_API_KEY,
    stripeSecretKey: STRIPE_SECRET_KEY,
    googleClientId: GOOGLE_CLIENT_ID,
    databaseUrl: DATABASE_URL,
    captureStorageDir: CAPTURE_STORAGE_DIR,
    captureImageMaxBytes: parseInt(CAPTURE_IMAGE_MAX_BYTES, 10),
    captureSceneMaxBytes: parseInt(CAPTURE_SCENE_MAX_BYTES, 10)
  };
}


