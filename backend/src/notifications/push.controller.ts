import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PushService } from './push.service';
import {
  SubscribePushDto,
  UnsubscribePushDto,
} from './dto/push-subscription.dto';
import type { Request } from 'express';

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly pushService: PushService) {}

  /** Retourne la clé publique VAPID pour que le frontend puisse s'abonner. */
  @Get('vapid-public-key')
  getVapidKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  /** Enregistre l'abonnement push du navigateur courant. */
  @Post('subscribe')
  @HttpCode(HttpStatus.CREATED)
  async subscribe(@Req() req: Request, @Body() dto: SubscribePushDto) {
    const user = req.user as { id: number };
    await this.pushService.subscribe({
      endpoint: dto.endpoint,
      keys: dto.keys,
      userId: user.id,
      userAgent: req.headers['user-agent'],
    });
    return { success: true };
  }

  /** Supprime l'abonnement push du navigateur courant. */
  @Delete('unsubscribe')
  @HttpCode(HttpStatus.OK)
  async unsubscribe(@Req() req: Request, @Body() dto: UnsubscribePushDto) {
    const user = req.user as { id: number };
    await this.pushService.unsubscribe(dto.endpoint, user.id);
    return { success: true };
  }
}
