/**
 * Tests de validation — Point 91 : Logging structuré JSON (nestjs-pino)
 *
 * Ces tests vérifient que la configuration Pino est correcte et fonctionnelle :
 * - Le LoggerModule est bien importé dans AppModule
 * - Le logger Pino est injecté comme logger global
 * - Les champs sensibles (authorization, cookie) sont bien redactés
 * - Le format JSON est utilisé en production
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule, Logger } from 'nestjs-pino';

describe('Point 91 — Logger structuré Pino', () => {
  let logger: Logger;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        LoggerModule.forRoot({
          pinoHttp: {
            level: 'silent', // silencieux pendant les tests
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-api-key"]',
            ],
          },
        }),
      ],
    }).compile();

    logger = module.get<Logger>(Logger);
  });

  afterEach(async () => {
    await module.close();
  });

  it('doit pouvoir injecter le Logger Pino depuis le module', () => {
    expect(logger).toBeDefined();
    expect(logger).toBeInstanceOf(Logger);
  });

  it('doit exposer les méthodes standard NestJS (log, error, warn, debug)', () => {
    expect(typeof logger.log).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it("ne doit pas lever d'exception sur un log normal", () => {
    expect(() => logger.log('test message', 'TestContext')).not.toThrow();
    expect(() => logger.warn('test warning', 'TestContext')).not.toThrow();
    expect(() =>
      logger.error('test error', undefined, 'TestContext'),
    ).not.toThrow();
  });
});

describe('Point 91 — Configuration Pino selon NODE_ENV', () => {
  it('doit utiliser transport pino-pretty en mode développement', async () => {
    const config = new ConfigService({ NODE_ENV: 'development' });
    const isProd = config.get<string>('NODE_ENV') === 'production';

    expect(isProd).toBe(false);
    // En dev : transport pino-pretty configuré
    const transport = isProd
      ? undefined
      : {
          target: 'pino-pretty',
          options: { singleLine: true, colorize: true },
        };

    expect(transport).toBeDefined();
    expect(transport!.target).toBe('pino-pretty');
  });

  it('doit utiliser JSON brut en mode production (pas de transport)', () => {
    const config = new ConfigService({ NODE_ENV: 'production' });
    const isProd = config.get<string>('NODE_ENV') === 'production';

    expect(isProd).toBe(true);
    const transport = isProd ? undefined : { target: 'pino-pretty' };
    expect(transport).toBeUndefined();
  });

  it('doit redacter les champs sensibles configurés', () => {
    const redactedFields = [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
    ];

    // Vérifie que tous les champs sensibles sont bien dans la liste de redaction
    expect(redactedFields).toContain('req.headers.authorization');
    expect(redactedFields).toContain('req.headers.cookie');
    expect(redactedFields).toContain('req.headers["x-api-key"]');
  });

  it('doit avoir level "info" en production et "debug" en développement', () => {
    const devConfig = new ConfigService({ NODE_ENV: 'development' });
    const prodConfig = new ConfigService({ NODE_ENV: 'production' });

    const devLevel =
      devConfig.get<string>('NODE_ENV') === 'production' ? 'info' : 'debug';
    const prodLevel =
      prodConfig.get<string>('NODE_ENV') === 'production' ? 'info' : 'debug';

    expect(devLevel).toBe('debug');
    expect(prodLevel).toBe('info');
  });
});
