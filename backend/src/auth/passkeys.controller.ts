import {
  Controller,
  Get,
  Post,
  Body,
  Delete,
  Param,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasskeysService } from './passkeys.service';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards';
import { CurrentUser } from './decorators';
import { PasskeyExempt } from './decorators/passkey-exempt.decorator';
import { User } from '@prisma/client';
import { RegistrationResponseDto, AuthenticationResponseDto } from './dto';
import { Request, Response } from 'express';
import { setAccessCookie, setRefreshCookie } from './auth-cookies';

@Controller('auth/passkeys')
export class PasskeysController {
  private readonly isProd: boolean;

  constructor(
    private readonly passkeysService: PasskeysService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.isProd = this.configService.get<string>('NODE_ENV') === 'production';
  }

  @UseGuards(JwtAuthGuard)
  @PasskeyExempt()
  @Get('register/options')
  async generateRegistrationOptions(@CurrentUser() user: User) {
    return this.passkeysService.generateRegistrationOptions(user);
  }

  @UseGuards(JwtAuthGuard)
  @PasskeyExempt()
  @Post('register/verify')
  async verifyRegistration(
    @CurrentUser() user: User,
    @Body() body: RegistrationResponseDto,
    @Req() req: Request,
  ) {
    return this.passkeysService.verifyRegistration(
      user,
      body.response,
      body.name,
      req,
    );
  }

  @Get('login/options')
  async generateAuthenticationOptions() {
    return this.passkeysService.generateAuthenticationOptions();
  }

  @HttpCode(HttpStatus.OK)
  @Post('login/verify')
  async verifyAuthentication(
    @Body() body: AuthenticationResponseDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.passkeysService.verifyAuthentication(
      body.response,
      body.sessionId,
      req,
    );
    // Complete login, skipping TOTP MFA since Passkey provides strong authentication
    const result = await this.authService.completeLogin(user.id);
    const { refreshToken, accessToken, expiresIn, mustChangePassword } = result;
    setRefreshCookie(res, refreshToken, this.isProd);
    setAccessCookie(res, accessToken, expiresIn, this.isProd);
    return {
      expiresIn,
      ...(mustChangePassword !== undefined ? { mustChangePassword } : {}),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async listPasskeys(@CurrentUser() user: User) {
    return this.passkeysService.listPasskeys(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deletePasskey(@CurrentUser() user: User, @Param('id') id: string) {
    return this.passkeysService.deletePasskey(user.id, id);
  }
}
