import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SetupService } from './setup.service';
import { InitializeAdminDto } from './dto';
import { SetupGuard } from './setup.guard';

/**
 * Setup Controller.
 *
 * Public endpoints for first-time setup.
 * No authentication required, but protected by:
 * - Bootstrap secret (SetupGuard)
 * - Rate limiting (1 attempt / 5 min / IP via guard + Throttle fallback)
 * - Transactional lock (service layer)
 */
@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  /**
   * Check if setup is needed.
   * Returns { needsSetup: true } if no admin exists.
   */
  @Get('status')
  async getStatus() {
    const needsSetup = await this.setupService.needsSetup();
    return { needsSetup };
  }

  /**
   * Initialize the first admin user.
   * Protected by bootstrap secret + rate limiting + transactional lock.
   */
  @Post('initialize')
  @UseGuards(SetupGuard)
  @Throttle({ default: { limit: 1, ttl: 300000 } }) // 1 attempt per 5 minutes (fallback)
  @HttpCode(HttpStatus.OK)
  async initialize(@Body() dto: InitializeAdminDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    return this.setupService.initializeAdmin(dto.username, dto.password, {
      addonsTodolistEnabled: dto.addonsTodolistEnabled,
      ip,
    });
  }
}
