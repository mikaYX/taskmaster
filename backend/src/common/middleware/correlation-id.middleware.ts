import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CorrelationIdMiddleware.name);

  constructor(private readonly cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = req.headers['x-correlation-id']
      ? (req.headers['x-correlation-id'] as string)
      : randomUUID();

    // Attach to CLS context
    this.cls.run(() => {
      this.cls.set('correlationId', correlationId);

      // Attach to Response Header
      res.setHeader('X-Correlation-ID', correlationId);

      // Log Request Start
      this.logger.log(`[${correlationId}] ${req.method} ${req.originalUrl}`);

      next();
    });
  }
}
