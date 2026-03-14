import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EmailService } from './email.service';
import { SendTestEmailDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';

/**
 * Email Controller.
 *
 * ADMIN-only test email endpoint.
 * No automation, no scheduler.
 */
@Controller('email')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  /**
   * Send a test email.
   */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  sendTest(@Body() dto: SendTestEmailDto) {
    return this.emailService.sendTest(dto.to, dto.subject, dto.body);
  }

  /**
   * Test the provider connection.
   */
  @Get('test-connection')
  testConnection() {
    return this.emailService.testConnection();
  }
}
