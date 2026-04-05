import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Issuer } from 'openid-client';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { SAML } from '@node-saml/node-saml';
import { FileInterceptor } from '@nestjs/platform-express';
import { SettingsService } from './settings.service';
import {
  SetSettingDto,
  TestEmailDto,
  CronPreviewDto,
  TestLdapConnectionDto,
  TestGoogleDto,
  TestAzureDto,
  TestSamlDto,
  TestOidcDto,
  SubmitFeedbackDto,
} from './dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions.enum';
import { EmailService } from '../email';
import { LdapService } from '../auth/ldap.service';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { safeFetch } from '../common/utils/url-validator.util';

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
    @Inject(forwardRef(() => LdapService))
    private readonly ldapService: LdapService,
  ) {}

  private withTimeout<T>(promise: Promise<T>, ms = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Network timeout (exceeded 5 seconds)')),
        ms,
      );
      promise.then(
        (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

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
    return this.ldapService.testConnection(dto);
  }

  /**
   * Test OIDC / Google connection.
   */
  @Post('google/test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  @HttpCode(HttpStatus.OK)
  async testGoogleConnection(@Body() dto: TestGoogleDto) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await safeFetch(
        'https://accounts.google.com/.well-known/openid-configuration',
        { signal: controller.signal },
        { timeoutMs: 5000, allowHttp: false },
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      if (!json.authorization_endpoint || !json.token_endpoint) {
        return { success: false, message: 'Invalid discovery document' };
      }

      return { success: true, message: 'Google OAuth configuration is valid' };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('timeout'))
      ) {
        return {
          success: false,
          message: 'Failed to connect to Google: Timeout',
        };
      }
      this.logger.warn(
        `[TEST_GOOGLE] Failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        message: `Failed to connect to Google: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
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
    try {
      const validTenants = ['common', 'organizations', 'consumers'];
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          dto.tenantId,
        );

      if (!isUUID && !validTenants.includes(dto.tenantId)) {
        throw new Error('Invalid tenant format');
      }

      const url = `https://login.microsoftonline.com/${dto.tenantId}/v2.0/.well-known/openid-configuration`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await safeFetch(
        url,
        { signal: controller.signal },
        { timeoutMs: 5000, allowHttp: false },
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404 || response.status === 400) {
          return {
            success: false,
            message: `Tenant ${dto.tenantId} not found`,
          };
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      if (!json.authorization_endpoint) {
        throw new Error(
          'Invalid discovery document missing authorization_endpoint',
        );
      }

      return {
        success: true,
        message: `Azure AD tenant ${dto.tenantId} is accessible`,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          message: 'Failed to connect to Azure AD: Timeout',
        };
      }
      this.logger.warn(
        `[TEST_AZURE] Failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        message: `Failed to connect to Azure AD: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
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
    try {
      try {
        let certStr = dto.x509.trim();
        if (!certStr.startsWith('-----BEGIN CERTIFICATE-----')) {
          // Add standard PEM wrappers
          certStr = `-----BEGIN CERTIFICATE-----\n${certStr.replace(/(.{64})/g, '$1\n')}\n-----END CERTIFICATE-----`;
        }
        new crypto.X509Certificate(certStr);
      } catch (e) {
        return {
          success: false,
          message: `Certificate parse error: ${e instanceof Error ? e.message : 'Invalid format'}`,
        };
      }

      if (dto.metadataUrl) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const response = await safeFetch(
            dto.metadataUrl,
            {
              signal: controller.signal,
            },
            { timeoutMs: 5000, allowHttp: false },
          );
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const xml = await response.text();
          if (
            !xml.includes('<EntityDescriptor') &&
            !xml.includes('<md:EntityDescriptor')
          ) {
            throw new Error('Missing EntityDescriptor');
          }
          if (
            !xml.includes('<SingleSignOnService') &&
            !xml.includes('<md:SingleSignOnService')
          ) {
            throw new Error('Missing SingleSignOnService');
          }
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
            return {
              success: false,
              message: 'Failed to fetch metadata: Timeout',
            };
          }
          return {
            success: false,
            message: `Failed to fetch metadata: ${e instanceof Error ? e.message : 'Unknown error'}`,
          };
        }
      }

      return { success: true, message: 'SAML configuration is valid' };
    } catch (error) {
      this.logger.warn(
        `[TEST_SAML] Failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test OIDC Generic configuration.
   */
  @Post('oidc/test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @RequirePermission(Permission.SETTINGS_WRITE)
  async testOidcConnection(@Body() dto: TestOidcDto) {
    try {
      // Validate that the issuer contains .well-known/openid-configuration
      const discoveryUrl = dto.issuer.endsWith('/')
        ? `${dto.issuer}.well-known/openid-configuration`
        : `${dto.issuer}/.well-known/openid-configuration`;

      // Fetch with 5 seconds timeout wrapped in safefetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await safeFetch(
        discoveryUrl,
        {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        },
        { timeoutMs: 5000, allowHttp: false },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          message: `Failed to fetch OIDC discovery document: ${response.status} ${response.statusText}`,
        };
      }

      const metadata = await response.json();

      // Validate required metadata endpoints
      if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
        return {
          success: false,
          message:
            'Invalid OIDC discovery document: missing required endpoints',
        };
      }

      return {
        success: true,
        message: 'OIDC configuration is valid',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          message: 'Connection timeout after 5 seconds',
        };
      }
      this.logger.warn(
        `OIDC test connection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        message: `Failed to connect to OIDC issuer: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
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
    return this.handleFileUpload(file, 'logo');
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
    return this.handleFileUpload(file, 'favicon');
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
   * Submit feedback to GitHub.
   */
  @Post('github/feedback')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async submitFeedback(
    @Body() dto: SubmitFeedbackDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.settingsService.submitFeedback(dto, user);
  }

  private handleFileUpload(
    file: { mimetype: string; originalname: string; buffer: Buffer },
    type: 'logo' | 'favicon',
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Save file (simple local storage)
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Clean up old files of same type to prevent accumulation
    try {
      const files = fs.readdirSync(uploadsDir);
      for (const f of files) {
        if (f.startsWith(`${type}-`)) {
          fs.unlinkSync(path.join(uploadsDir, f));
        }
      }
    } catch (error) {
      // Ignore errors (e.g. permission issues or race conditions), continue with upload
      console.warn(`Failed to cleanup old ${type} files:`, error);
    }

    const ext = path.extname(file.originalname);
    const filename = `${type}-${Date.now()}${ext}`;
    const filepath = path.join(uploadsDir, filename);

    fs.writeFileSync(filepath, file.buffer);

    return {
      url: `/public/uploads/${filename}`,

      originalName: file.originalname,
    };
  }
}
