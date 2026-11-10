import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { EncryptionService } from './encryption.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditCategory } from '../audit/audit.constants';
import {
  SETTINGS_REGISTRY,
  SETTING_KEYS,
  SettingKey,
  SettingValue,
  isValidKey,
} from './settings.registry';
import { SettingResponseDto } from './dto';
import parser from 'cron-parser';
import * as fs from 'fs';
import * as path from 'path';
import { getUploadsDir } from '../config/app-paths';

import {
  decodeSetting,
  encodeSetting,
  parseValue,
  presentSetting,
  SENSITIVE_PLACEHOLDER,
} from './setting-codec';

/**
 * Whitelist of settings keys returned by `getPublicBranding()`.
 *
 * Public endpoint, NO authentication. Any key added here is observable by
 * any anonymous visitor of the login page (AUDIT.md Finding #17). Strict
 * review required for additions.
 *
 * - `app.title`, `app.subtitle`, `app.logoUrl`, `app.faviconUrl`,
 *   `app.wallpaperUrl`: branding
 *   visible on the login screen.
 * - `ui.theme`: dark/light mode default — needed before login so the page
 *   matches subsequent in-app appearance.
 * - `auth.generic.enabled`, `auth.generic.oidc.providerName`: control whether
 *   to render the SSO button and what label to show; the provider's display
 *   name is intentionally public.
 * - `auth.passkeys.enabled`: feature flag, controls passkey button rendering.
 * - `addons.todolist.enabled`: sidebar feature flag read before auth so the
 *   shell renders consistently.
 *
 * MUST NOT include: any `*.clientSecret`, `*.apiKey`, `*.password`,
 * `*.privateKey`, `*.signingKey`, internal endpoints, DB URLs, etc.
 */
export const PUBLIC_BRANDING_KEYS = [
  'app.title',
  'app.subtitle',
  // Display flags for the same public title/subtitle, used by every role.
  'app.showTitle',
  'app.showSubtitle',
  'app.logoUrl',
  'app.faviconUrl',
  'app.wallpaperUrl',
  'app.loginCardOpacity',
  'app.logoDarkUrl',
  'app.wallpaperBlur',
  'app.wallpaperDim',
  'app.loginWelcomeText',
  'app.loginMessage',
  'app.accentColor',
  // Sidebar header layout, rendered for every role.
  'app.logoAlign',
  'app.textAlign',
  'ui.theme',
  'auth.generic.enabled',
  'auth.generic.oidc.providerName',
  'auth.passkeys.enabled',
  'addons.todolist.enabled',
] as const;

const UPLOAD_URL_KEYS = new Set([
  'app.logoUrl',
  'app.logoDarkUrl',
  'app.faviconUrl',
  'app.wallpaperUrl',
]);
const UPLOADS_URL_PREFIX = '/public/uploads/';

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
   *
   * AUDIT.md Finding #17: the list of public-facing settings keys is
   * intentionally pinned here and exported as a read-only constant so any
   * future addition is reviewable. Each key is justified inline — add a
   * comment when extending the list and confirm the value is never sensitive.
   */
  async getPublicBranding(): Promise<Record<string, unknown>> {
    const stored = await this.prisma.client.config.findMany({
      where: { key: { in: [...PUBLIC_BRANDING_KEYS] } },
    });

    // Registry defaults first: a fresh install has no rows yet, and clients
    // would otherwise see no value (e.g. no subtitle) until a setting is saved.
    const result: Record<string, unknown> = {};
    for (const key of PUBLIC_BRANDING_KEYS) {
      result[key] = SETTINGS_REGISTRY[key].default;
    }
    for (const record of stored) {
      result[record.key] = parseValue(record.value);
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

    const [
      azureTenant,
      azureClient,
      azureSecret,
      azureEnabledRaw,
      googleClient,
      googleSecret,
      googleEnabledRaw,
      genericType,
      genericEnabledRaw,
      oidcIssuer,
      oidcClient,
      oidcSecret,
      samlEntity,
      samlSso,
      samlCert,
      ldapUrl,
      ldapBindDn,
      ldapBindPass,
      ldapSearch,
      ldapEnabledRaw,
    ] = await Promise.all(authKeys.map((key) => this.getRawValue(key)));

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

    const azureEnabled = azureEnabledRaw === true;

    // Debug logging
    this.logger.debug(
      `Google config check: client=${JSON.stringify(googleClient)} (${typeof googleClient}), ` +
        `secret=${googleSecret ? '[PRESENT]' : '[EMPTY]'} (${typeof googleSecret})`,
    );

    const googleConfigured =
      isConfigured(googleClient) && isConfigured(googleSecret);
    this.logger.debug(`Google configured: ${googleConfigured}`);

    const googleEnabled = googleEnabledRaw === true;

    const genericEnabled = genericEnabledRaw === true;

    const oidcConfigured =
      isConfigured(oidcIssuer) &&
      isConfigured(oidcClient) &&
      isConfigured(oidcSecret);

    const samlConfigured =
      isConfigured(samlEntity) &&
      isConfigured(samlSso) &&
      isConfigured(samlCert);

    const ldapConfigured =
      isConfigured(ldapUrl) &&
      isConfigured(ldapBindDn) &&
      isConfigured(ldapBindPass) &&
      isConfigured(ldapSearch);
    const ldapEnabled = ldapEnabledRaw === true;

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
    const storedMap = new Map(stored.map((record) => [record.key, record]));
    return SETTING_KEYS.map((key) => this.toResponse(key, storedMap.get(key)));
  }

  private toResponse(
    key: SettingKey,
    record?: { value: string; updatedAt: Date } | null,
  ): SettingResponseDto {
    const config = SETTINGS_REGISTRY[key];
    return {
      key,
      value: presentSetting(
        key,
        config.sensitive
          ? undefined
          : decodeSetting(key, record?.value, this.encryption),
        { stored: record != null },
      ),
      sensitive: config.sensitive,
      description: config.description,
      updatedAt: record?.updatedAt,
    };
  }

  async get(key: string): Promise<SettingResponseDto> {
    if (!isValidKey(key)) {
      throw new BadRequestException(`Unknown setting key: ${key}`);
    }
    const record = await this.prisma.client.config.findUnique({
      where: { key },
    });
    return this.toResponse(key, record);
  }

  /** Resolve both VAPID settings under a cross-process PostgreSQL lock. */
  async getOrCreateVapidKeys(
    generate: () => { publicKey: string; privateKey: string },
  ): Promise<{ publicKey: string; privateKey: string }> {
    const publicKeySetting = 'push.vapid.publicKey';
    const privateKeySetting = 'push.vapid.privateKey';
    const keys = await this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(824731, 1)::text`;
      // Read inside the lock, bypassing each instance's settings cache.
      const read = async (
        key: typeof publicKeySetting | typeof privateKeySetting,
      ) => {
        const record = await tx.config.findUnique({ where: { key } });
        return decodeSetting(key, record?.value, this.encryption);
      };
      const publicKey = await read(publicKeySetting);
      const privateKey = await read(privateKeySetting);
      if (publicKey && privateKey) return { publicKey, privateKey };

      const generated = generate();
      for (const [key, value] of [
        [publicKeySetting, generated.publicKey],
        [privateKeySetting, generated.privateKey],
      ] as const) {
        const stored = encodeSetting(key, value, this.encryption);
        await tx.config.upsert({
          where: { key },
          create: { key, value: stored },
          update: { value: stored },
        });
      }
      return generated;
    });
    this.invalidateCache(publicKeySetting);
    this.invalidateCache(privateKeySetting);
    return keys;
  }

  /**
   * Get raw value (for internal use).
   * Decrypts sensitive values.
   */
  async getRawValue<K extends SettingKey>(key: K): Promise<SettingValue<K>>;
  async getRawValue(key: SettingKey): Promise<SettingValue<SettingKey>> {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now < cached.expiresAt) {
      return SETTINGS_REGISTRY[key].schema.parse(cached.value);
    }

    const record = await this.prisma.client.config.findUnique({
      where: { key },
    });

    const parsedVal = decodeSetting(key, record?.value, this.encryption);
    this.cache.set(key, {
      value: parsedVal,
      expiresAt: now + this.CACHE_TTL_MS,
    });
    return parsedVal;
  }

  /**
   * Deletes the file an upload-backed setting (logo, favicon, wallpaper)
   * pointed to, so replaced or removed images don't pile up on disk.
   */
  private removeUploadedFile(key: string, previous: unknown): void {
    if (!UPLOAD_URL_KEYS.has(key)) return;
    if (
      typeof previous !== 'string' ||
      !previous.startsWith(UPLOADS_URL_PREFIX)
    )
      return;

    // basename() blocks any path traversal smuggled into the stored URL
    const filename = path.basename(previous.slice(UPLOADS_URL_PREFIX.length));
    try {
      fs.unlinkSync(path.join(getUploadsDir(), filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          `Failed to delete uploaded file ${filename}: ${error}`,
        );
      }
    }
  }

  /**
   * Set a setting value.
   */
  async set(
    key: string,
    value: unknown,
    actor?: { id: number; username: string },
  ): Promise<SettingResponseDto> {
    if (!isValidKey(key)) {
      throw new BadRequestException(`Unknown setting key: ${key}`);
    }

    const config = SETTINGS_REGISTRY[key];

    // The API shows sensitive values as a mask; a form that sends the mask back
    // untouched means "unchanged". Storing it would replace the real secret
    // (SMTP password, API keys...) with the mask itself.
    if (config.sensitive && value === SENSITIVE_PLACEHOLDER) {
      return this.get(key);
    }

    // Validate with Zod schema
    const result = config.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(
        `Invalid value for ${key}: ${result.error.message}`,
      );
    }

    // Get value before update for audit
    const beforeRaw = await this.getRawValue(key);
    const before = beforeRaw;

    const serialized = encodeSetting(key, result.data, this.encryption);

    const record = await this.prisma.client.config.upsert({
      where: { key },
      create: { key, value: serialized },
      update: { value: serialized },
    });

    this.invalidateCache(key);

    if (before !== result.data) {
      this.removeUploadedFile(key, before);
    }

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

    return this.toResponse(key, record);
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

    this.removeUploadedFile(key, before);

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

    return this.toResponse(key);
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
