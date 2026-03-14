import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Global exception filter that sanitizes error responses.
 *
 * Security fix: In production, stack traces are never exposed to clients.
 * This addresses the audit finding of stack traces being sent in error responses.
 */
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

    // Expose Prisma error message for DB schema/query issues (e.g. missing column)
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      message = exception.message || message;
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

    // Always log the full error for debugging (message in main line so 500 cause is visible)
    const errMessage =
      exception instanceof Error ? exception.message : String(exception);
    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${errMessage}`,
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
