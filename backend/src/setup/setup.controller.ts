import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SetupService } from './setup.service';
import { InitializeAdminDto } from './dto';

/**
 * Setup Controller.
 *
 * Public endpoints for first-time setup.
 * No authentication required.
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
   * Only works if no admin exists (security).
   */
  @Post('initialize')
  @HttpCode(HttpStatus.OK)
  async initialize(@Body() dto: InitializeAdminDto) {
    return this.setupService.initializeAdmin(dto.username, dto.password, {
      addonsTodolistEnabled: dto.addonsTodolistEnabled,
    });
  }
}
