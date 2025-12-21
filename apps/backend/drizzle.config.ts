import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      process.env.DATABASE_PUBLIC_URL ??
      process.env.POSTGRES_URL ??
      'postgres://postgres:postgres@localhost:5432/whiteboardai'
  }
});
