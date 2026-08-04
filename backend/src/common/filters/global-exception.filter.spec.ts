import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GlobalExceptionFilter } from './global-exception.filter';

/**
 * Tests for AUDIT.md Finding #5 — Prisma error messages no longer leak the
 * internal schema. We assert:
 *  - well-known Prisma error codes are mapped to generic messages + status
 *  - a correlationId is always included so operators can pivot to logs
 *  - the upstream correlationId (set by `CorrelationIdMiddleware`) is reused
 *    when present, instead of generating a fresh one
 *  - regular HttpException pass-through unchanged
 */
describe('GlobalExceptionFilter (AUDIT #5 — Prisma sanitisation)', () => {
  let filter: GlobalExceptionFilter;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let response: { status: jest.Mock; json: jest.Mock };
  let request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    correlationId?: string;
  };
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    response = { status: statusMock, json: jsonMock };
    request = { method: 'POST', url: '/api/users', headers: {} };
    host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
  });

  const captureResponse = () => {
    expect(statusMock).toHaveBeenCalledTimes(1);
    expect(jsonMock).toHaveBeenCalledTimes(1);
    return {
      status: statusMock.mock.calls[0][0] as number,
      body: jsonMock.mock.calls[0][0] as Record<string, unknown>,
    };
  };

  it('maps P2002 (unique violation) to 409 with a generic message', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      { code: 'P2002', clientVersion: '6.0.0', meta: { target: ['email'] } },
    );

    filter.catch(err, host);

    const { status, body } = captureResponse();
    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body.error).toBe('Resource already exists');
    expect(body.code).toBe('P2002');
    expect(typeof body.correlationId).toBe('string');
    // CRITICAL: the native Prisma message must not be exposed
    expect(JSON.stringify(body)).not.toContain('Unique constraint failed');
    expect(JSON.stringify(body)).not.toContain('email');
  });

  it('maps P2025 (record not found) to 404 with a generic message', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'An operation failed because it depends on one or more records that were required but not found',
      { code: 'P2025', clientVersion: '6.0.0' },
    );

    filter.catch(err, host);

    const { status, body } = captureResponse();
    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body.error).toBe('Resource not found');
    expect(body.code).toBe('P2025');
    expect(body.correlationId).toBeDefined();
  });

  it('maps P2003 (FK violation) to 422', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed on the field: …',
      { code: 'P2003', clientVersion: '6.0.0' },
    );

    filter.catch(err, host);

    const { status, body } = captureResponse();
    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.error).toBe('Related resource not found');
  });

  it('maps an unknown Prisma error code to a generic 500', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Some other database failure',
      { code: 'P9999', clientVersion: '6.0.0' },
    );

    filter.catch(err, host);

    const { status, body } = captureResponse();
    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.error).toBe('Database error');
    expect(body.code).toBe('P9999');
    expect(body.correlationId).toBeDefined();
  });

  it('reuses an upstream correlationId when present on the request', () => {
    request.correlationId = '11111111-2222-3333-4444-555555555555';
    const err = new Prisma.PrismaClientKnownRequestError('boom', {
      code: 'P2002',
      clientVersion: '6.0.0',
    });

    filter.catch(err, host);

    const { body } = captureResponse();
    expect(body.correlationId).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('reuses an upstream X-Correlation-Id header when the request property is absent', () => {
    request.headers['x-correlation-id'] = 'abcdef';
    const err = new Prisma.PrismaClientKnownRequestError('boom', {
      code: 'P2002',
      clientVersion: '6.0.0',
    });

    filter.catch(err, host);

    const { body } = captureResponse();
    expect(body.correlationId).toBe('abcdef');
  });

  it('passes regular HttpException unchanged (no correlationId added)', () => {
    const err = new HttpException('Bad input', HttpStatus.BAD_REQUEST);

    filter.catch(err, host);

    const { status, body } = captureResponse();
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body.error).toBe('Bad input');
    expect(body.correlationId).toBeUndefined();
  });

  it('returns a generic 500 for unknown errors without leaking the message', () => {
    filter.catch(new Error('Internal pgbouncer melted'), host);

    const { status, body } = captureResponse();
    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.error).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('pgbouncer');
  });
});
