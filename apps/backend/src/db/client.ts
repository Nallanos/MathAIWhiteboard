import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import type { EnvConfig } from '../lib/env.js';

const { Pool } = pg;

type Database = NodePgDatabase<typeof schema>;

let db: Database | null = null;

export function getDb(config: EnvConfig) {
  if (!db) {
    const connectionString = config.databaseUrl;
    const shouldUseSsl =
      /\.proxy\.rlwy\.net\b/i.test(connectionString) ||
      /sslmode=require/i.test(connectionString) ||
      (process.env.DATABASE_SSL || '').toLowerCase() === 'true';

    const pool = new Pool({
      connectionString,
      ...(shouldUseSsl
        ? {
            ssl: {
              // Railway public proxy uses TLS; CA chain may not be present in slim images.
              rejectUnauthorized: false,
            },
          }
        : null),
    });
    db = drizzle(pool, { schema });
  }
  return db;
}
