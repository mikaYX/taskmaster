import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { IsString, IsNotEmpty } from 'class-validator';
import { AuthService } from './auth.service';
import { OidcService } from './oidc.service';
import { AzureAdService } from './azure-ad.service';
import { SamlService } from './saml.service';
import { LoginDto, ChangePasswordDto } from './dto';
import { JwtAuthGuard } from './guards';
import { CsrfTokenGuard } from './guards/csrf-token.guard';
import {
  AuthRateLimitGuard,
  AuthRateLimit,
  AuthRateLimitType,
} from './guards/auth-rate-limit.guard';
import { CurrentUser } from './decorators';
import { PasskeyExempt } from './decorators/passkey-exempt.decorator';
import { Audit } from '../audit/decorators/audit.decorator';
import { AuditAction, AuditCategory } from '../audit/audit.constants';
import { JwtPayload } from './strategies/jwt.strategy';
import {
  REFRESH_COOKIE_NAME,
  setAccessCookie as applyAccessCookie,
  setRefreshCookie as applyRefreshCookie,
  clearAccessCookie as removeAccessCookie,
  clearRefreshCookie as removeRefreshCookie,
} from './auth-cookies';

class VerifyMfaLoginDto {
  @IsString()
  @IsNotEmpty()
  mfaToken!: string;

  @IsString()
  @IsNotEmpty()
  token!: string;
}

class ExchangeSsoTicketDto {
  @IsString()
  @IsNotEmpty()
  ssoTicket!: string;
}

type AuthClientSession = {
  expiresIn: number;
  mustChangePassword?: boolean;
};

@Controller('auth')
export class AuthController {
  /** Name of the HttpOnly cookie carrying the refresh token. */
  static readonly REFRESH_COOKIE_NAME = REFRESH_COOKIE_NAME;

  private readonly isProd: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly oidcService: OidcService,
    private readonly azureAdService: AzureAdService,
    private readonly samlService: SamlService,
    private readonly configService: ConfigService,
  ) {
    this.isProd = this.configService.get<string>('NODE_ENV') === 'production';
  }

  /** Writes the refresh token as a Secure HttpOnly cookie on the response. */
  private setRefreshCookie(res: Response, refreshToken: string): void {
    applyRefreshCookie(res, refreshToken, this.isProd);
  }

  /** Writes the access token as a Secure HttpOnly cookie on the response. */
  private setAccessCookie(
    res: Response,
    accessToken: string,
    expiresInSeconds: number,
  ): void {
    applyAccessCookie(res, accessToken, expiresInSeconds, this.isProd);
  }

  /** Clears the refresh token cookie (logout). */
  private clearRefreshCookie(res: Response): void {
    removeRefreshCookie(res, this.isProd);
  }

  /** Clears the access token cookie (logout / auth failure). */
  private clearAccessCookie(res: Response): void {
    removeAccessCookie(res, this.isProd);
  }

  private toClientSession(data: {
    expiresIn: number;
    mustChangePassword?: boolean;
  }): AuthClientSession {
    return {
      expiresIn: data.expiresIn,
      ...(data.mustChangePassword !== undefined
        ? { mustChangePassword: data.mustChangePassword }
        : {}),
    };
  }

  @Post('login')
  @Audit({
    action: AuditAction.AUTH_LOGIN_SUCCESS,
    category: AuditCategory.AUTH,
    failureAction: AuditAction.AUTH_LOGIN_FAILURE,
  })
  // Throttle NestJS (in-memory, fallback si Redis indisponible)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  // Guard Redis multi-fenêtres : 5/min et 10/15min par IP + 10/15min par username
  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit(AuthRateLimitType.LOGIN)
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;

    const result = await this.authService.login(
      loginDto.username,
      loginDto.password,
      userAgent,
      ipAddress,
    );

    // MFA challenge — no tokens yet, nothing to set in cookie
    if ('requiresMfa' in result) {
      return result;
    }

    const { refreshToken, accessToken, ...rest } = result;
    this.setRefreshCookie(res, refreshToken);
    this.setAccessCookie(res, accessToken, rest.expiresIn);
    return this.toClientSession(rest);
  }

  @Post('mfa/verify')
  @Audit({
    action: AuditAction.AUTH_LOGIN_SUCCESS,
    category: AuditCategory.AUTH,
    failureAction: AuditAction.AUTH_LOGIN_FAILURE,
  })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  // Même fenêtre que login : le token MFA est la 2e étape du même flux
  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit(AuthRateLimitType.LOGIN)
  @HttpCode(HttpStatus.OK)
  async verifyMfa(
    @Body() body: VerifyMfaLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;

    const result = await this.authService.verifyMfaLogin(
      body.mfaToken,
      body.token,
      userAgent,
      ipAddress,
    );

    const { refreshToken, accessToken, ...rest } = result;
    this.setRefreshCookie(res, refreshToken);
    this.setAccessCookie(res, accessToken, rest.expiresIn);
    return this.toClientSession(rest);
  }

  @Get('session')
  @PasskeyExempt()
  @UseGuards(JwtAuthGuard)
  async getSession(@CurrentUser() user: JwtPayload) {
    const session = await this.authService.getSession(user.sub);

    if (!session) {
      return { valid: false, user: null };
    }

    const permissions: string[] = [];
    if (session.role === 'ADMIN')
      permissions.push('admin', 'manage_users', 'manage_settings', 'view_logs');
    if (session.role === 'USER')
      permissions.push('view_tasks', 'complete_tasks');

    const flatResponse = {
      id: session.id,
      username: session.username,
      fullname: session.fullname,
      role: session.role,
      groups: session.groupIds,
      passkeysEnabled: session.passkeysEnabled,
      passkeyPolicy: session.passkeyPolicy,
      hasPasskey: session.hasPasskey,
    };

    const userObj = {
      ...session,
      permissions,
    };

    return {
      valid: true,
      ...flatResponse,
      user: userObj,
    };
  }

  @Post('refresh')
  // Throttle NestJS : fallback in-memory
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  // Guard Redis : 30/min et 60/5min par IP
  @UseGuards(AuthRateLimitGuard, CsrfTokenGuard)
  @AuthRateLimit(AuthRateLimitType.REFRESH)
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = req.cookies?.[AuthController.REFRESH_COOKIE_NAME];

    if (!rawToken) {
      throw new UnauthorizedException('Missing refresh token cookie');
    }

    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;

    const result = await this.authService.refreshTokens(
      rawToken,
      userAgent,
      ipAddress,
    );

    if (!result) {
      this.clearAccessCookie(res);
      this.clearRefreshCookie(res);
      throw new UnauthorizedException('Refresh token invalid or revoked');
    }

    const { refreshToken, accessToken, ...rest } = result;
    this.setRefreshCookie(res, refreshToken);
    this.setAccessCookie(res, accessToken, rest.expiresIn);
    return this.toClientSession(rest);
  }

  @Post('password')
  @Audit({
    action: AuditAction.USER_PASSWORD_CHANGED,
    category: AuditCategory.USER,
  })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('sub') userId: number,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(userId, dto.password);
    return { ok: true };
  }

  @Post('logout')
  @PasskeyExempt()
  @Audit({
    action: AuditAction.AUTH_LOGOUT,
    category: AuditCategory.AUTH,
  })
  @UseGuards(CsrfTokenGuard, JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser('sub') userId: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(userId);
    this.clearAccessCookie(res);
    this.clearRefreshCookie(res);
    return { ok: true };
  }

  @Get('external/login/:provider')
  async externalLogin(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const baseUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/auth/external/callback/${provider}`;
    const url = await this.oidcService.getLoginUrl(provider, redirectUri);
    res.redirect(url);
  }

  @Get('external/callback/:provider')
  async externalCallback(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const baseUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/auth/external/callback/${provider}`;
    const fullUrl = `${req.protocol}://${req.get('host')}${req.url}`;
    const profile = await this.oidcService.handleCallback(
      provider,
      redirectUri,
      fullUrl,
    );

    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;
    const tokens = await this.authService.loginOidc(
      profile,
      userAgent,
      ipAddress,
    );

    const ssoTicket = await this.oidcService.createSsoTicket({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?sso_ticket=${ssoTicket}`);
  }

  @Get('azure/login')
  async azureLogin(@Req() req: Request, @Res() res: Response) {
    const baseUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/auth/azure/callback`;
    const url = await this.azureAdService.getLoginUrl(redirectUri);
    res.redirect(url);
  }

  @Get('azure/callback')
  async azureCallback(@Req() req: Request, @Res() res: Response) {
    const baseUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/auth/azure/callback`;

    const code = req.query.code as string;
    const state = req.query.state as string;

    const profile = await this.azureAdService.handleCallback(
      code,
      state,
      redirectUri,
    );

    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;
    const tokens = await this.authService.loginAzureAd(
      profile,
      userAgent,
      ipAddress,
    );

    const ssoTicket = await this.oidcService.createSsoTicket({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?sso_ticket=${ssoTicket}`);
  }

  @Get('saml/metadata')
  async samlMetadata(@Res() res: Response) {
    const metadata = await this.samlService.getSpMetadata();
    res.setHeader('Content-Type', 'application/xml');
    res.send(metadata);
  }

  @Get('saml/login')
  async samlLogin(@Req() req: Request, @Res() res: Response) {
    const url = await this.samlService.getLoginUrl();
    res.redirect(url);
  }

  @Post('saml/acs')
  async samlAcs(@Req() req: Request, @Res() res: Response) {
    const samlResponse = req.body.SAMLResponse;
    const relayState = req.body.RelayState;

    if (!samlResponse) {
      return res.status(HttpStatus.BAD_REQUEST).send('Missing SAMLResponse');
    }

    const profile = await this.samlService.validateResponse(
      samlResponse,
      relayState,
    );

    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;
    const tokens = await this.authService.loginSaml(
      profile,
      userAgent,
      ipAddress,
    );

    const ssoTicket = await this.oidcService.createSsoTicket({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?sso_ticket=${ssoTicket}`);
  }

  // One-time exchange: sso_ticket -> tokens (sets HttpOnly cookie)
  @Post('external/exchange')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async exchangeSsoTicket(
    @Body() dto: ExchangeSsoTicketDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.oidcService.consumeSsoTicket(dto.ssoTicket);
    const { refreshToken, accessToken, ...rest } = result;
    this.setRefreshCookie(res, refreshToken);
    this.setAccessCookie(res, accessToken, rest.expiresIn);
    return this.toClientSession(rest);
  }
}
