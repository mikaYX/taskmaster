import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class AsyncContextMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    // Note: user and x-site-id are stored in CLS from within the auth guards,
    // after JWT validation, to ensure req.user is already populated.
    next();
  }
}
