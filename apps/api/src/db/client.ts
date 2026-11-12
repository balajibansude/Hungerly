import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

import * as schema from './schema';

/** Any Drizzle Postgres database or transaction over this schema (node-postgres or PGlite). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

export interface Database {
  db: Db;
  close(): Promise<void>;
}

export function connectPostgres(url: string): Database {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzleNodePg(pool, { schema }) as unknown as Db;
  return { db, close: () => pool.end() };
}

export async function migratePostgres(url: string, migrationsFolder = MIGRATIONS_DIR): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrateNodePg(drizzleNodePg(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

export { schema };
