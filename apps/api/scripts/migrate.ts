import { loadConfig } from '../src/config';
import { migratePostgres } from '../src/db/client';

const config = loadConfig();
await migratePostgres(config.DATABASE_URL);
console.warn('Migrations applied.');
