import {
  Controller,
  Post,
  UseGuards,
  Req,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MfaService } from './mfa.service';
import { EnableMfaDto } from './dto/mfa.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { PrismaService } from '../prisma';

@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly prisma: PrismaService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generate(@Req() req: any) {
    const user = req.user as JwtPayload;
    if (!user?.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Fetch email or use username as fallback for the authenticator app label
    const dbUser = await this.prisma.client.user.findUnique({
      where: { id: user.sub },
      select: { email: true, username: true },
    });
    const identifier = dbUser?.email || dbUser?.username || 'user';

    const result = await this.mfaService.generateMfaSecret(
      user.sub,
      identifier,
    );
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('enable')
  @HttpCode(HttpStatus.OK)
  async enable(@Req() req: any, @Body() body: EnableMfaDto) {
    const user = req.user as JwtPayload;
    const recoveryCodes = await this.mfaService.enableMfa(user.sub, body.token);
    return {
      message: 'MFA successfully enabled',
      recoveryCodes,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('disable')
  @HttpCode(HttpStatus.OK)
  async disable(@Req() req: any) {
    const user = req.user as JwtPayload;
    await this.mfaService.disableMfa(user.sub);
    return { message: 'MFA successfully disabled' };
  }
}
