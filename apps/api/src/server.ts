import { buildApp } from './app';
import { loadConfig } from './config';
import { connectPostgres } from './db/client';
import { createLocalStorage } from './lib/storage';
import { createPayoutProvider } from './modules/payouts/razorpayx';

const config = loadConfig();
const database = connectPostgres(config.DATABASE_URL);
const app = await buildApp({
  config,
  db: database.db,
  storage: createLocalStorage(config.STORAGE_DIR),
  payoutProvider: createPayoutProvider(config),
});

app.log.info(
  { env: config.NODE_ENV, payoutProvider: app.deps.payoutProvider.mode, otpDelivery: app.deps.otpSender.kind },
  'Starting Hungerly API',
);

const shutdown = async () => {
  await app.close();
  await database.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: config.HOST, port: config.PORT });
