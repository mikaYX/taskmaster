import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import {
  AuditActionType,
  AuditCategory,
  AuditSeverity,
} from './audit.constants';
import { Reflector } from '@nestjs/core';
import { AuditDecoratorOptions, AUDIT_KEY } from './decorators/audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method } = req;

    const meta = this.reflector.getAllAndOverride<AuditDecoratorOptions>(
      AUDIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!meta) {
      return next.handle();
    }

    if (method === 'GET') {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          this.logAudit(context, req, data, 'SUCCESS', meta);
        },
        error: (error) => {
          this.logAudit(context, req, error, 'FAILURE', meta);
        },
      }),
    );
  }

  private async logAudit(
    context: ExecutionContext,
    req: any,
    responseData: any,
    status: 'SUCCESS' | 'FAILURE',
    meta: AuditDecoratorOptions,
  ) {
    try {
      const user = req.user;
      const method = req.method;
      const path = req.route ? req.route.path : req.url;

      const category = meta.category;
      let action = meta.action;
      let severity = meta.severity ?? AuditSeverity.INFO;

      if (status === 'FAILURE') {
        action = meta.failureAction ?? meta.action;
        severity = AuditSeverity.WARN;
      }

      // Don't log if no user (unless Auth login attempt)
      if (!user && category !== 'AUTH') {
        this.logger.warn(
          `AuditInterceptor: Skipping - No user found in request and category is not AUTH. Path: ${path}`,
        );
        return;
      }

      // Construct payload
      await this.auditService.log({
        action: action,
        category: category,
        actorId: user?.id,
        actorName: user?.username || 'Anonymous',
        target: path,
        severity: severity,
        details: {
          method,
          url: req.url,
          status,
          // Avoid logging full body for sensitive endpoints
          body:
            path.includes('login') || path.includes('password')
              ? '***'
              : req.body,
        },
        ipAddress: req.ip,
      });
    } catch (e) {
      this.logger.error('Failed to log audit', e);
    }
  }
}
