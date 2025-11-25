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
    const pool = new Pool({
      connectionString: config.databaseUrl
    });
    db = drizzle(pool, { schema });
  }
  return db;
}
