import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { LdapService } from '../auth/ldap.service';
import { safeFetch } from '../common/utils/url-validator.util';
import {
  TestAzureDto,
  TestGoogleDto,
  TestLdapConnectionDto,
  TestOidcDto,
  TestSamlDto,
} from './dto';

@Injectable()
export class SsoConnectionTester {
  private readonly logger = new Logger(SsoConnectionTester.name);
  constructor(
    @Inject(forwardRef(() => LdapService))
    private readonly ldapService: LdapService,
  ) {}

  async testLdapConnection(dto: TestLdapConnectionDto) {
    return this.ldapService.testConnection(dto);
  }

  async testGoogleConnection(_dto: TestGoogleDto) {
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

  async testAzureConnection(dto: TestAzureDto) {
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

  async testSamlConnection(dto: TestSamlDto) {
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

  async testOidcConnection(dto: TestOidcDto) {
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
}
