import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserNotificationsService } from './user-notifications.service';

/** The signed-in user's own notification center. */
@UseGuards(JwtAuthGuard)
@Controller('inbox')
export class InboxController {
  constructor(private readonly inbox: UserNotificationsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.inbox.list(user.sub);
  }

  /** Above `:id/read` so "read-all" is not taken for an id. */
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  readAll(@CurrentUser() user: JwtPayload) {
    return this.inbox.markAllRead(user.sub);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  read(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.inbox.markRead(user.sub, id);
  }
}
