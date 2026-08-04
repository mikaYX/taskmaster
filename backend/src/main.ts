import { setDefaultResultOrder } from 'dns';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync } from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { GlobalExceptionFilter, GlobalValidationPipe } from './common';
import { bootstrapOTel } from './otel-sdk';
import { getClientDir, getPublicDir } from './config/app-paths';
import { waitForDependencies } from './config/wait-for-dependencies';

// Node 18+ resolves "localhost" preferring whatever order the OS resolver
// returns, which on Windows (especially running as a service account) often
// comes back IPv6-first (::1). Memurai/Redis (installer default host:
// "localhost") only binds 127.0.0.1, never ::1, so every connection to ::1
// gets refused - waitForDependencies()'s retry loop then spins silently
// until its own 60s deadline, the app never reaches app.listen(), and the
// installer's health check times out. Confirmed on a real Windows Service
// install: PostgreSQL listens on both stacks and was unaffected, only Redis
// was refusing every attempt. Forcing ipv4first here applies to every
// subsequent DNS lookup in the process (this app's own TCP probe, ioredis,
// node-postgres), not just the first one.
setDefaultResultOrder('ipv4first');

/**
 * Application bootstrap.
 *
 * Sets up:
 * - Helmet (security headers)
 * - Global validation pipe (class-validator)
 * - Global exception filter (sanitized errors)
 * - CORS configuration
 * - Static assets
 */
async function bootstrap(): Promise<void> {
  // Initialize OpenTelemetry
  await bootstrapOTel();

  // Wait for PostgreSQL/Redis to accept connections before starting Nest —
  // a Windows Service's "depend on" SCM ordering only guarantees those
  // services report Running, not that they're reachable yet.
  await waitForDependencies();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true, // Met en buffer les logs jusqu'à ce que Pino soit prêt
  });

  // Allows OnModuleDestroy/beforeApplicationShutdown hooks to run on
  // SIGTERM/SIGINT, so a service manager (WinSW, systemd) can stop the
  // process cleanly (in-flight BullMQ jobs, Prisma pool, Redis clients).
  app.enableShutdownHooks();

  // Utilise Pino comme logger global (JSON en prod, pretty en dev)
  app.useLogger(app.get(Logger));

  // Serve static assets (uploads, etc)
  app.useStaticAssets(getPublicDir(), {
    prefix: '/public/',
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Sécurisation du Proxy inverse pour lire les vraies IP (X-Forwarded-For) derrière Nginx/LoadBalancer
  const trustProxy = configService.get<string>('TRUST_PROXY', 'loopback');
  if (trustProxy === 'true') {
    app.set('trust proxy', true);
  } else if (trustProxy === 'false') {
    app.set('trust proxy', false);
  } else if (!isNaN(Number(trustProxy))) {
    app.set('trust proxy', Number(trustProxy));
  } else {
    // e.g 'loopback', 'linklocal', ou une IP spécifique
    app.set('trust proxy', trustProxy);
  }

  // Parse cookies (required for HttpOnly refresh token cookie)
  app.use(cookieParser());

  // Security headers (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production' ? undefined : false, // Disable CSP in dev
    }),
  );

  // Global validation pipe
  app.useGlobalPipes(new GlobalValidationPipe());

  // Global exception filter (no stack traces in production)
  app.useGlobalFilters(new GlobalExceptionFilter());

  // API prefix
  app.setGlobalPrefix('api');

  // CORS configuration
  app.enableCors({
    origin:
      nodeEnv === 'production'
        ? configService
            .get<string>('CORS_ORIGIN', '')
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean) // Split, trim, and remove empty
        : true,
    credentials: true,
  });

  // SPA frontend (mode fullstack : un seul conteneur) — si client/index.html existe
  const clientPath = getClientDir();
  if (existsSync(join(clientPath, 'index.html'))) {
    app.use(express.static(clientPath));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        req.method === 'GET' &&
        !req.path.startsWith('/api') &&
        !req.path.startsWith('/public')
      ) {
        return res.sendFile(join(clientPath, 'index.html'));
      }
      next();
    });
  }

  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`Application running on port ${port} [${nodeEnv}]`, 'Bootstrap');
  logger.log(`API available at http://localhost:${port}/api`, 'Bootstrap');
}

bootstrap();
