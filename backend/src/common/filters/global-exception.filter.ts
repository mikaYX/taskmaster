import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Global exception filter that sanitizes error responses.
 *
 * Security fix: In production, stack traces are never exposed to clients.
 * This addresses the audit finding of stack traces being sent in error responses.
 *
 * AUDIT.md Finding #5: PrismaClientKnownRequestError messages leak internal
 * schema details (table names, columns, unique constraint targets) and can
 * facilitate account enumeration (P2002 on `email` → confirms existence).
 * We now map known Prisma error codes to a small set of generic responses and
 * surface a `correlationId` so operators can still pivot from the client
 * report to the full server-side log entry.
 */
const PRISMA_ERROR_MAP: Record<string, { status: HttpStatus; error: string }> =
  {
    P2002: { status: HttpStatus.CONFLICT, error: 'Resource already exists' },
    P2025: { status: HttpStatus.NOT_FOUND, error: 'Resource not found' },
    P2003: {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      error: 'Related resource not found',
    },
    P2014: {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      error: 'Invalid relation between resources',
    },
  };

const PRISMA_DEFAULT_ERROR = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  error: 'Database error',
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code: string | undefined;
    let correlationId: string | undefined;

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Reuse upstream CorrelationIdMiddleware value when present; otherwise
      // generate a fresh UUID so the client always gets a referenceable id.
      correlationId =
        ((request as Request & { correlationId?: string }).correlationId ??
          (request.headers['x-correlation-id'] as string | undefined)) ||
        randomUUID();

      const mapped = PRISMA_ERROR_MAP[exception.code] ?? PRISMA_DEFAULT_ERROR;
      status = mapped.status;
      message = mapped.error;
      code = exception.code;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || message;
        code = resp.code as string | undefined;
      }
    }

    // Always log the full error for debugging (message in main line so 500 cause is visible).
    // For Prisma errors, the native message — which may include table/column names
    // and PII — stays server-side only and is keyed by correlationId.
    const errMessage =
      exception instanceof Error ? exception.message : String(exception);
    const correlationSuffix = correlationId
      ? ` - correlationId=${correlationId}`
      : '';
    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${errMessage}${correlationSuffix}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    // Build sanitized response
    const errorResponse: Record<string, unknown> = {
      statusCode: status,
      error: message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Only include error code if present
    if (code) {
      errorResponse.code = code;
    }

    if (correlationId) {
      errorResponse.correlationId = correlationId;
    }

    // In development, include additional debug info
    if (process.env.NODE_ENV === 'development' && exception instanceof Error) {
      errorResponse.debug = {
        name: exception.name,
        stack: exception.stack,
      };
    }

    response.status(status).json(errorResponse);
  }
}
