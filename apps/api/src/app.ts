import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { createOtpSender, type OtpSender } from './auth/otpSender';
import { createTokenSigner, type TokenSigner } from './auth/tokens';
import type { Config } from './config';
import type { Db } from './db/client';
import { AppError } from './lib/errors';
import type { Storage } from './lib/storage';
import { systemClock, type Clock } from './lib/time';
import type { PayoutProvider } from './modules/payouts/provider';
import { registerRoutes } from './routes';

export interface AppDeps {
  config: Config;
  db: Db;
  storage: Storage;
  clock: Clock;
  payoutProvider: PayoutProvider;
  tokens: TokenSigner;
  otpSender: OtpSender;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
  interface FastifyRequest {
    /** Raw body bytes, captured only for webhook routes (signature verification). */
    rawBody?: Buffer;
  }
}

export interface BuildAppOptions {
  config: Config;
  db: Db;
  storage: Storage;
  payoutProvider: PayoutProvider;
  clock?: Clock;
  otpSender?: OtpSender;
  logger?: FastifyServerOptions['logger'];
}

const PROBLEM_TYPE = 'https://docs.hungerly.app/errors/';

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const app = Fastify({
    logger: options.logger ?? { level: config.LOG_LEVEL },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    // Never log credentials or personal data.
    disableRequestLogging: config.NODE_ENV === 'test',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const deps: AppDeps = {
    config,
    db: options.db,
    storage: options.storage,
    clock: options.clock ?? systemClock,
    payoutProvider: options.payoutProvider,
    tokens: await createTokenSigner(config),
    otpSender: options.otpSender ?? createOtpSender(config, app.log),
  };
  app.decorate('deps', deps);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.CORS_ORIGINS ? config.CORS_ORIGINS.split(',').map((o) => o.trim()) : false,
  });
  await app.register(rateLimit, {
    global: true,
    max: config.NODE_ENV === 'test' ? 10_000 : 300,
    timeWindow: '1 minute',
  });
  await app.register(multipart, {
    limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 10 },
  });

  app.setErrorHandler((error, request, reply) => {
    const problem = (status: number, code: string, title: string, detail?: string, errors?: Record<string, string[]>) =>
      reply
        .status(status)
        .type('application/problem+json')
        .send({ type: `${PROBLEM_TYPE}${code}`, title, status, code, detail, errors });

    if (error instanceof AppError) {
      return problem(error.status, error.code, error.message, error.message, error.fieldErrors);
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      const errors: Record<string, string[]> = {};
      for (const issue of error.validation) {
        const path = issue.instancePath.replace(/^\//, '').replace(/\//g, '.') || '_';
        (errors[path] ??= []).push(issue.message ?? "Invalid value");
      }
      return problem(422, 'validation', 'Some fields need attention.', 'Some fields need attention.', errors);
    }
    const err = error as { statusCode?: number; code?: string; message?: string };
    if (err.statusCode === 429) {
      return problem(429, 'rate_limited', 'Too many requests. Please wait a moment.');
    }
    if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.code === 'FST_FILES_LIMIT') {
      return problem(413, 'document.invalid_file', 'The file is too large.');
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return problem(err.statusCode, 'validation', 'The request could not be processed.', err.message);
    }
    request.log.error({ err: error }, 'Unhandled error');
    return problem(500, 'internal', 'Something went wrong on our side. Please try again.');
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).type('application/problem+json').send({
      type: `${PROBLEM_TYPE}not_found`,
      title: 'Not found.',
      status: 404,
      code: 'not_found',
    }),
  );

  await app.register(
    async (api) => {
      await registerRoutes(api);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
