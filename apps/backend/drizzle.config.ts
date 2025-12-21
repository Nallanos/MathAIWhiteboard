import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: (() => {
      const primary = (process.env.DATABASE_URL ?? '').trim();
      const publicUrl = (process.env.DATABASE_PUBLIC_URL ?? '').trim();
      const postgresUrl = (process.env.POSTGRES_URL ?? '').trim();

      const isRailway = Boolean(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT);
      const isLocalhostUrl = (value: string) => {
        try {
          const host = new URL(value).hostname;
          return host === 'localhost' || host === '127.0.0.1' || host === '::1';
        } catch {
          return false;
        }
      };

      if (primary && (!isRailway || !isLocalhostUrl(primary))) return primary;
      return publicUrl || postgresUrl || 'postgres://postgres:postgres@localhost:5432/whiteboardai';
    })()
  }
});
