import { SsoConnectionTester } from './sso-connection-tester';
import { SettingsUploads } from './settings-uploads';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  forwardRef,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/decorators';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Permission } from '../auth/permissions.enum';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { EmailService } from '../email';
import {
  CronPreviewDto,
  SetSettingDto,
  TestAzureDto,
  TestEmailDto,
  TestGoogleDto,
  TestLdapConnectionDto,
  TestOidcDto,
  TestSamlDto,
} from './dto';
import { SettingsService } from './settings.service';

/**
 * Settings Controller.
 *
 * Most endpoints require ADMIN role.
 * Sensitive values are never returned in plaintext.
 */
@Controller('settings')
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(
    private readonly settingsService: SettingsService,
    @Inject(forwardRef(() => EmailService))
    private readonly emailService: EmailService,
    private readonly ssoTester: SsoConnectionTester,
    private readonly uploads: SettingsUploads,
  ) {}

  /**
   * Get public branding settings (no auth required).
   * Returns only non-sensitive branding settings for login page.
   */
  @Get('public/branding')
  getPublicBranding() {
    return this.settingsService.getPublicBranding();
  }

  /**
   * Get authentication capability map.
   */
  @Get('auth/capabilities')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_READ)
  getAuthCapabilities() {
    return this.settingsService.getAuthCapabilities();
  }

  /**
   * Get all settings.
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_READ)
  getAll() {
    return this.settingsService.getAll();
  }

  /**
   * Get a single setting.
   */
  @Get(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_READ)
  get(@Param('key') key: string) {
    return this.settingsService.get(key);
  }

  /**
   * Set a setting value.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  @HttpCode(HttpStatus.OK)
  async set(@Body() dto: SetSettingDto, @CurrentUser() user: JwtPayload) {
    return this.settingsService.set(dto.key, dto.value, {
      id: user.sub,
      username: user.username,
    });
  }

  /**
   * Set multiple settings at once (Bulk Update).
   */
  @Post('bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  @HttpCode(HttpStatus.OK)
  async setBulk(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.settingsService.setBulk(body, {
      id: user.sub,
      username: user.username,
    });
  }

  /**
   * Get email configuration status.
   * Used by MFA Email OTP to determine availability.
   */
  @Get('email/config-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_READ)
  getEmailConfigStatus() {
    return this.emailService.getConfigStatus();
  }

  /**
   * Send a test email.
   */
  @Post('test-email')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  @HttpCode(HttpStatus.OK)
  async sendTestEmail(@Body() dto: TestEmailDto) {
    return this.emailService.sendTest(dto.to, dto.subject, dto.body);
  }

  /**
   * Preview cron expression next run.
   */
  @Post('cron-preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_READ)
  @HttpCode(HttpStatus.OK)
  cronPreview(@Body() dto: CronPreviewDto) {
    // Strict Cron Contract: Accept either 'cron' or 'expression'
    const expression = dto.cron || dto.expression;
    if (!expression) {
      throw new BadRequestException('Cron expression is required');
    }
    return this.settingsService.cronPreview(expression);
  }

  /**
   * Test LDAP connection configuration before saving.
   */
  @Post('test-ldap')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  @HttpCode(HttpStatus.OK)
  async testLdapConnection(@Body() dto: TestLdapConnectionDto) {
    return this.ssoTester.testLdapConnection(dto);
  }

  /**
   * Test OIDC / Google connection.
   */
  @Post('google/test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  @HttpCode(HttpStatus.OK)
  async testGoogleConnection(@Body() _dto: TestGoogleDto) {
    return this.ssoTester.testGoogleConnection(_dto);
  }

  /**
   * Test Azure AD configuration.
   */
  @Post('azure/test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  @HttpCode(HttpStatus.OK)
  async testAzureConnection(@Body() dto: TestAzureDto) {
    return this.ssoTester.testAzureConnection(dto);
  }

  /**
   * Test SAML configuration.
   */
  @Post('saml/test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  @HttpCode(HttpStatus.OK)
  async testSamlConnection(@Body() dto: TestSamlDto) {
    return this.ssoTester.testSamlConnection(dto);
  }

  /**
   * Test OIDC Generic configuration.
   */
  @Post('oidc/test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  async testOidcConnection(@Body() dto: TestOidcDto) {
    return this.ssoTester.testOidcConnection(dto);
  }

  /**
   * Upload application logo.
   */
  @Post('upload-logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(
    @UploadedFile(
      new FileValidationPipe({
        allowedMimeTypes: [
          'image/png',
          'image/jpeg',
          'image/webp',
          'image/x-icon',
        ],
        maxSizeBytes: 5 * 1024 * 1024,
      }),
    )
    file: {
      mimetype: string;
      originalname: string;
      buffer: Buffer;
    },
  ) {
    return this.uploads.save(file, 'logo');
  }

  /**
   * Upload application logo used in dark mode.
   */
  @Post('upload-logo-dark')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  uploadLogoDark(
    @UploadedFile(
      new FileValidationPipe({
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
        maxSizeBytes: 5 * 1024 * 1024,
      }),
    )
    file: {
      mimetype: string;
      originalname: string;
      buffer: Buffer;
    },
  ) {
    return this.uploads.save(file, 'logodark');
  }

  /**
   * Upload application favicon.
   */
  @Post('upload-favicon')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  uploadFavicon(
    @UploadedFile(
      new FileValidationPipe({
        allowedMimeTypes: [
          'image/png',
          'image/jpeg',
          'image/webp',
          'image/x-icon',
        ],
        maxSizeBytes: 5 * 1024 * 1024,
      }),
    )
    file: {
      mimetype: string;
      originalname: string;
      buffer: Buffer;
    },
  ) {
    return this.uploads.save(file, 'favicon');
  }

  /**
   * Upload login screen wallpaper.
   */
  @Post('upload-wallpaper')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  uploadWallpaper(
    @UploadedFile(
      new FileValidationPipe({
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
        maxSizeBytes: 10 * 1024 * 1024,
      }),
    )
    file: {
      mimetype: string;
      originalname: string;
      buffer: Buffer;
    },
  ) {
    return this.uploads.save(file, 'wallpaper');
  }

  /**
   * Reset a setting to default.
   */
  @Delete(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  async reset(@Param('key') key: string, @CurrentUser() user: JwtPayload) {
    return this.settingsService.reset(key, {
      id: user.sub,
      username: user.username,
    });
  }

  /**
   * Deprecated compatibility endpoint kept to avoid stale frontend failures
   * during rolling deployments or cached-client upgrades.
   */
  @Post('github/feedback')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  submitFeedbackCompatibility() {
    this.logger.debug(
      'Ignored deprecated GitHub feedback request for upgrade compatibility',
    );
    return { success: true };
  }
}
