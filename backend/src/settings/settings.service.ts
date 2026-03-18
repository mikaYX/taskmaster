import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { EncryptionService } from './encryption.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditCategory } from '../audit/audit.constants';
import {
  SETTINGS_REGISTRY,
  SETTING_KEYS,
  SettingKey,
  isValidKey,
} from './settings.registry';
import { SettingResponseDto } from './dto';
import parser from 'cron-parser';
import { safeFetch } from '../common/utils/url-validator.util';

const SENSITIVE_PLACEHOLDER = '••••••••';

/**
 * Settings Service.
 *
 * - Validates keys against whitelist
 * - Validates values with Zod schemas
 * - Encrypts sensitive values at rest
 * - Never returns sensitive plaintext values
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly cache = new Map<
    string,
    { value: unknown; expiresAt: number }
  >();
  private readonly CACHE_TTL_MS = 60_000; // 60 secondes

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Get public branding settings (no auth required).
   * Only returns non-sensitive branding settings for login page.
   */
  async getPublicBranding(): Promise<Record<string, unknown>> {
    const brandingKeys = [
      'app.title',
      'app.subtitle',
      'app.logoUrl',
      'app.faviconUrl',
      'ui.theme',
      'auth.generic.enabled',
      'auth.generic.oidc.providerName',
      'auth.passkeys.enabled',
      'addons.todolist.enabled',
    ];
    const stored = await this.prisma.client.config.findMany({
      where: { key: { in: brandingKeys } },
    });

    const result: Record<string, unknown> = {};
    for (const record of stored) {
      result[record.key] = this.parseValue(record.value);
    }
    return result;
  }

  /**
   * Get authentication capability map.
   * Returns implementation and configuration status for all providers.
   */
  async getAuthCapabilities() {
    // Helper to check if a value is truly configured (not empty or whitespace)
    const isConfigured = (value: unknown): boolean => {
      if (value === null || value === undefined) return false;
      const str = String(value).trim();
      return str.length > 0;
    };

    // Clear cache for auth settings to get fresh values
    const authKeys = [
      'auth.azureAd.tenantId',
      'auth.azureAd.clientId',
      'auth.azureAd.clientSecret',
      'auth.azureAd.enabled',
      'auth.google.clientId',
      'auth.google.clientSecret',
      'auth.google.enabled',
      'auth.generic.type',
      'auth.generic.enabled',
      'auth.generic.oidc.issuer',
      'auth.generic.oidc.clientId',
      'auth.generic.oidc.clientSecret',
      'auth.generic.saml.entityId',
      'auth.generic.saml.ssoUrl',
      'auth.generic.saml.x509',
      'auth.ldap.url',
      'auth.ldap.bindDn',
      'auth.ldap.bindPassword',
      'auth.ldap.searchBase',
      'auth.ldap.enabled',
    ] as const;

    authKeys.forEach((key) => this.cache.delete(key));

    const azureTenant = await this.getRawValue('auth.azureAd.tenantId');
    const azureClient = await this.getRawValue('auth.azureAd.clientId');
    const azureSecret = await this.getRawValue('auth.azureAd.clientSecret');

    // Debug logging
    this.logger.debug(
      `Azure config check: tenant=${JSON.stringify(azureTenant)} (${typeof azureTenant}), ` +
        `client=${JSON.stringify(azureClient)} (${typeof azureClient}), ` +
        `secret=${azureSecret ? '[PRESENT]' : '[EMPTY]'} (${typeof azureSecret})`,
    );

    const azureConfigured =
      isConfigured(azureTenant) &&
      isConfigured(azureClient) &&
      isConfigured(azureSecret);
    this.logger.debug(`Azure configured: ${azureConfigured}`);

    const azureEnabled =
      String(await this.getRawValue('auth.azureAd.enabled')) === 'true';

    const googleClient = await this.getRawValue('auth.google.clientId');
    const googleSecret = await this.getRawValue('auth.google.clientSecret');

    // Debug logging
    this.logger.debug(
      `Google config check: client=${JSON.stringify(googleClient)} (${typeof googleClient}), ` +
        `secret=${googleSecret ? '[PRESENT]' : '[EMPTY]'} (${typeof googleSecret})`,
    );

    const googleConfigured =
      isConfigured(googleClient) && isConfigured(googleSecret);
    this.logger.debug(`Google configured: ${googleConfigured}`);

    const googleEnabled =
      String(await this.getRawValue('auth.google.enabled')) === 'true';

    const genericType = await this.getRawValue('auth.generic.type');
    const genericEnabled =
      String(await this.getRawValue('auth.generic.enabled')) === 'true';

    const oidcIssuer = await this.getRawValue('auth.generic.oidc.issuer');
    const oidcClient = await this.getRawValue('auth.generic.oidc.clientId');
    const oidcSecret = await this.getRawValue('auth.generic.oidc.clientSecret');
    const oidcConfigured =
      isConfigured(oidcIssuer) &&
      isConfigured(oidcClient) &&
      isConfigured(oidcSecret);

    const samlEntity = await this.getRawValue('auth.generic.saml.entityId');
    const samlSso = await this.getRawValue('auth.generic.saml.ssoUrl');
    const samlCert = await this.getRawValue('auth.generic.saml.x509');
    const samlConfigured =
      isConfigured(samlEntity) &&
      isConfigured(samlSso) &&
      isConfigured(samlCert);

    const ldapUrl = await this.getRawValue('auth.ldap.url');
    const ldapBindDn = await this.getRawValue('auth.ldap.bindDn');
    const ldapBindPass = await this.getRawValue('auth.ldap.bindPassword');
    const ldapSearch = await this.getRawValue('auth.ldap.searchBase');
    const ldapConfigured =
      isConfigured(ldapUrl) &&
      isConfigured(ldapBindDn) &&
      isConfigured(ldapBindPass) &&
      isConfigured(ldapSearch);
    const ldapEnabled =
      String(await this.getRawValue('auth.ldap.enabled')) === 'true';

    return {
      oidc_generic: {
        implemented: true,
        configured: oidcConfigured,
        enabled: genericEnabled && genericType === 'oidc',
        effectiveEnabled: genericEnabled && genericType === 'oidc',
      },
      ldap: {
        implemented: true,
        configured: ldapConfigured,
        enabled: ldapEnabled,
        effectiveEnabled: ldapEnabled,
      },
      azure_ad: {
        implemented: true,
        configured: azureConfigured,
        enabled: azureEnabled,
        effectiveEnabled: azureEnabled && azureConfigured,
      },
      google_workspace: {
        implemented: true,
        configured: googleConfigured,
        enabled: googleEnabled,
        effectiveEnabled: googleEnabled,
      },
      saml: {
        implemented: true,
        configured: samlConfigured,
        enabled: genericEnabled && genericType === 'saml',
        effectiveEnabled:
          genericEnabled && genericType === 'saml' && samlConfigured,
      },
    };
  }

  /**
   * Get all settings.
   * Sensitive values are masked.
   */
  async getAll(): Promise<SettingResponseDto[]> {
    const stored = await this.prisma.client.config.findMany();
    const storedMap = new Map(stored.map((s: any) => [s.key, s]));

    return SETTING_KEYS.map((key) => {
      const config = SETTINGS_REGISTRY[key];
      const record = storedMap.get(key);
      const sensitive = config.sensitive;

      let value: unknown;
      if (record) {
        value = sensitive
          ? SENSITIVE_PLACEHOLDER
          : this.parseValue((record as any).value);
      } else {
        value = sensitive ? SENSITIVE_PLACEHOLDER : config.default;
      }

      return {
        key,
        value,
        sensitive,
        description: config.description,
        updatedAt: (record as any)?.updatedAt,
      };
    });
  }

  /**
   * Get a single setting.
   */
  async get(key: string): Promise<SettingResponseDto> {
    if (!isValidKey(key)) {
      throw new BadRequestException(`Unknown setting key: ${key}`);
    }

    const config = SETTINGS_REGISTRY[key];
    const record = await this.prisma.client.config.findUnique({
      where: { key },
    });
    const sensitive = config.sensitive;

    let value: unknown;
    if (record) {
      value = sensitive
        ? SENSITIVE_PLACEHOLDER
        : this.parseValue((record as any).value);
    } else {
      value = sensitive ? SENSITIVE_PLACEHOLDER : config.default;
    }

    return {
      key,
      value,
      sensitive,
      description: config.description,
      updatedAt: (record as any)?.updatedAt,
    };
  }

  /**
   * Get raw value (for internal use).
   * Decrypts sensitive values.
   */
  async getRawValue<T = unknown>(key: SettingKey): Promise<T> {
    const config = SETTINGS_REGISTRY[key];

    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now < cached.expiresAt) {
      return cached.value as T;
    }

    const record = await this.prisma.client.config.findUnique({
      where: { key },
    });

    if (!record) {
      const defaultVal = config.default as T;
      this.cache.set(key, {
        value: defaultVal,
        expiresAt: now + this.CACHE_TTL_MS,
      });
      return defaultVal;
    }

    let value = record.value;
    if (config.sensitive && this.encryption.isEncrypted(value)) {
      value = this.encryption.decrypt(value);
    }

    const parsedVal = this.parseValue(value) as T;
    this.cache.set(key, {
      value: parsedVal,
      expiresAt: now + this.CACHE_TTL_MS,
    });
    return parsedVal;
  }

  /**
   * Set a setting value.
   */
  async set(
    key: string,
    value: unknown,
    actor?: { id: number; username: string },
  ): Promise<SettingResponseDto> {
    this.logger.log(`DEBUG SET: ${key} = ${JSON.stringify(value)}`);
    if (!isValidKey(key)) {
      throw new BadRequestException(`Unknown setting key: ${key}`);
    }

    const config = SETTINGS_REGISTRY[key];

    // Validate with Zod schema
    const result = config.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(
        `Invalid value for ${key}: ${result.error.message}`,
      );
    }

    // SSO Unimplemented Providers Guard

    // Get value before update for audit
    const beforeRaw = await this.getRawValue(key);
    const before = beforeRaw;

    // Serialize value
    let serialized = JSON.stringify(result.data);

    // Encrypt if sensitive
    if (config.sensitive) {
      serialized = this.encryption.encrypt(serialized);
    }

    await this.prisma.client.config.upsert({
      where: { key },
      create: { key, value: serialized },
      update: { value: serialized },
    });

    this.invalidateCache(key);

    const after = result.data;

    if (actor) {
      await this.auditService.logDiff({
        action: AuditAction.SETTINGS_UPDATED,
        actor,
        target: `Setting:${key}`,
        category: AuditCategory.SETTINGS,
        before: { [key]: before },
        after: { [key]: after },
      });
    }

    this.logger.log(`Setting updated: ${key}`);

    return {
      key,
      value: config.sensitive ? SENSITIVE_PLACEHOLDER : result.data,
      sensitive: config.sensitive,
      description: config.description,
      updatedAt: new Date(),
    };
  }
  /**
   * Reset a setting to default.
   */
  async reset(
    key: string,
    actor?: { id: number; username: string },
  ): Promise<SettingResponseDto> {
    if (!isValidKey(key)) {
      throw new BadRequestException(`Unknown setting key: ${key}`);
    }

    // Get value before delete for audit
    const beforeRaw = await this.getRawValue(key);
    const before = beforeRaw;

    await this.prisma.client.config.deleteMany({ where: { key } });

    this.invalidateCache();

    const config = SETTINGS_REGISTRY[key];
    const after = config.default; // Reset reverts to default

    if (actor) {
      await this.auditService.logDiff({
        action: AuditAction.SETTINGS_UPDATED,
        actor,
        target: `Setting:${key}`,
        category: AuditCategory.SETTINGS,
        before: { [key]: before },
        after: { [key]: after },
      });
    }

    this.logger.log(`Setting reset: ${key}`);

    return {
      key,
      value: config.sensitive ? SENSITIVE_PLACEHOLDER : config.default,
      sensitive: config.sensitive,
      description: config.description,
    };
  }

  /**
   * Set multiple settings at once (Bulk Update).
   * Flattens nested objects to match registry keys.
   */
  async setBulk(
    settings: Record<string, unknown>,
    actor?: { id: number; username: string },
  ): Promise<SettingResponseDto[]> {
    const flattened = this.flattenObject(settings);
    const results: SettingResponseDto[] = [];

    // Pre-validation for unimplemented providers in bulk

    // Special validation guard for global scheduling window
    if (
      flattened['SCHEDULE_DEFAULT_START_TIME'] !== undefined ||
      flattened['SCHEDULE_DEFAULT_END_TIME'] !== undefined
    ) {
      const newStart =
        flattened['SCHEDULE_DEFAULT_START_TIME'] ??
        (await this.getRawValue('SCHEDULE_DEFAULT_START_TIME'));
      const newEnd =
        flattened['SCHEDULE_DEFAULT_END_TIME'] ??
        (await this.getRawValue('SCHEDULE_DEFAULT_END_TIME'));
      if (typeof newStart === 'string' && typeof newEnd === 'string') {
        if (newStart >= newEnd) {
          throw new BadRequestException(
            'Global default start time must be strictly less than end time.',
          );
        }
      }
    }

    for (const [key, value] of Object.entries(flattened)) {
      if (isValidKey(key)) {
        try {
          const result = await this.set(key, value, actor);
          results.push(result);
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to set setting ${key}: ${errMsg}`);
        }
      } else {
        this.logger.warn(
          `Ignored unknown setting key during bulk update: ${key}`,
        );
      }
    }

    this.invalidateCache();

    return results;
  }

  /**
   * Preview next run date for a cron expression.
   */
  cronPreview(cron: string): {
    nextExecutions: Date[];
    nextRuns: string[];
    expression: string;
  } {
    try {
      const interval = parser.parse(cron);
      const nextExecutions: Date[] = [];
      const nextRuns: string[] = []; // Compat for frontend
      for (let i = 0; i < 5; i++) {
        const date = interval.next().toDate();
        nextExecutions.push(date);
        nextRuns.push(date.toISOString());
      }

      return {
        expression: cron,
        nextExecutions,
        nextRuns,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Invalid cron expression: ${message}`);
    }
  }

  private parseValue(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  /**
   * Submit feedback to GitHub.
   */
  async submitFeedback(
    dto: any,
    user: { username: string },
  ): Promise<{ success: boolean }> {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || 'Mika/taskmaster';

    if (!token) {
      this.logger.warn('GitHub feedback failed: No GITHUB_TOKEN configured.');
      throw new BadRequestException('GitHub integration is not configured.');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await safeFetch(
        `https://api.github.com/repos/${repo}/issues`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: `[${dto.type.toUpperCase()}] ${dto.title}`,
            body: `**From User:** ${user.username}\n\n**Type:** ${dto.type}\n\n**Description:**\n${dto.description}`,
            labels: [dto.type, 'user-feedback'],
          }),
          signal: controller.signal as RequestInit["signal"],
        },
        { timeoutMs: 10000, allowHttp: false }
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
      }

      return { success: true };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to submit GitHub feedback: ${errMsg}`);
      throw new BadRequestException('Failed to submit feedback at this time.');
    }
  }

  private flattenObject(
    obj: Record<string, unknown>,
    prefix = '',
  ): Record<string, unknown> {
    return Object.keys(obj).reduce(
      (acc, k) => {
        const pre = prefix.length ? prefix + '.' : '';
        if (
          typeof obj[k] === 'object' &&
          obj[k] !== null &&
          !Array.isArray(obj[k])
        ) {
          Object.assign(
            acc,
            this.flattenObject(obj[k] as Record<string, unknown>, pre + k),
          );
        } else {
          acc[pre + k] = obj[k];
        }
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }

  private invalidateCache(key?: string) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}
