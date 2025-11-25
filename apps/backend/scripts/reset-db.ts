import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../src/db/schema';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const db = drizzle(pool, { schema });

async function reset() {
  console.log('Resetting database...');
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  console.log('Database reset complete.');
  process.exit(0);
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
