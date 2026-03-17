import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { LdapService } from '../auth/ldap.service';
import { EmailService } from '../email/email.service';
import { JwtAuthGuard, RolesGuard } from '../auth';

describe('SettingsController', () => {
  let controller: SettingsController;
  let settingsService: jest.Mocked<SettingsService>;
  let ldapService: jest.Mocked<LdapService>;

  beforeEach(async () => {
    const mockSettingsService = {
      getPublicBranding: jest.fn(),
      getAll: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
    };

    const mockLdapService = {
      testConnection: jest.fn(),
      authenticate: jest.fn(),
    };

    const mockEmailService = {};

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: LdapService, useValue: mockLdapService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SettingsController>(SettingsController);
    settingsService = module.get(SettingsService);
    ldapService = module.get(LdapService);
  });

  describe('testLdapConnection()', () => {
    it('should call ldapService.testConnection and return success', async () => {
      const dto = { url: 'ldap://test', searchBase: 'dc=example,dc=com' };
      ldapService.testConnection.mockResolvedValue({
        success: true,
        message: 'OK',
      });

      const result = await controller.testLdapConnection(dto);

      expect(ldapService.testConnection).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ success: true, message: 'OK' });
    });

    it('should return failure if ldapService.testConnection fails', async () => {
      const dto = { url: 'ldap://test', searchBase: 'dc=example,dc=com' };
      ldapService.testConnection.mockResolvedValue({
        success: false,
        message: 'Error',
      });

      const result = await controller.testLdapConnection(dto);

      expect(result).toEqual({ success: false, message: 'Error' });
    });
  });

  describe('getAuthCapabilities()', () => {
    it('should call settingsService.getAuthCapabilities and return the result', async () => {
      const mockResult = {
        oidc_generic: {
          implemented: true,
          configured: true,
          enabled: true,
          effectiveEnabled: true,
        },
        ldap: {
          implemented: true,
          configured: false,
          enabled: false,
          effectiveEnabled: false,
        },
        azure_ad: {
          implemented: false,
          configured: false,
          enabled: false,
          effectiveEnabled: false,
        },
        google_workspace: {
          implemented: false,
          configured: false,
          enabled: false,
          effectiveEnabled: false,
        },
        saml: {
          implemented: false,
          configured: false,
          enabled: false,
          effectiveEnabled: false,
        },
      };

      // We need to add getAuthCapabilities to the mock settings service
      (settingsService as any).getAuthCapabilities = jest
        .fn()
        .mockResolvedValue(mockResult);

      const result = await controller.getAuthCapabilities();

      expect((settingsService as any).getAuthCapabilities).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });
  });

  describe('testGoogleConnection()', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('should return success on valid config', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          authorization_endpoint: 'http://auth',
          token_endpoint: 'http://token',
        }),
      });

      const result = await controller.testGoogleConnection({
        clientId: 'test-id',
        clientSecret: 'secret',
      });

      expect(result).toEqual({
        success: true,
        message: 'Google OAuth configuration is valid',
      });
    });

    it('should handle timeout', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => {
        const error = new Error('Timeout');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const result = await controller.testGoogleConnection({
        clientId: 'test-id',
        clientSecret: 'secret',
      });

      expect(result).toEqual({
        success: false,
        message: 'Failed to connect to Google: Timeout',
      });
    });

    it('should handle HTTP error from discovery endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });
      const result = await controller.testGoogleConnection({
        clientId: 'invalid',
        clientSecret: 'invalid',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('401');
    });

    it('should handle invalid JSON in discovery document', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'data' }), // Missing required fields
      });
      const result = await controller.testGoogleConnection({
        clientId: 'test',
        clientSecret: 'test',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid discovery document');
    });
  });

  describe('testAzureConnection()', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('should return success on valid tenant uuid', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          authorization_endpoint: 'http://auth',
        }),
      });

      const result = await controller.testAzureConnection({
        tenantId: '12345678-1234-1234-1234-123456789abc',
        clientId: 'id',
        clientSecret: 'sec',
      });

      expect(result).toEqual({
        success: true,
        message:
          'Azure AD tenant 12345678-1234-1234-1234-123456789abc is accessible',
      });
    });

    it('should handle 404 tenant not found', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await controller.testAzureConnection({
        tenantId: 'organizations',
        clientId: 'id',
        clientSecret: 'secret',
      });

      expect(result).toEqual({
        success: false,
        message: 'Tenant organizations not found',
      });
    });

    it('should handle timeout', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => {
        const error = new Error('Timeout');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const result = await controller.testAzureConnection({
        tenantId: 'common',
        clientId: 'test',
        clientSecret: 'test',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Timeout');
    });
  });

  describe('testOidcConnection', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('should validate OIDC configuration', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          authorization_endpoint: 'http://auth',
          token_endpoint: 'http://token',
        }),
      });

      const dto = {
        issuer: 'https://accounts.google.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: 'openid email profile',
      };
      const result = await controller.testOidcConnection(dto);
      expect(result.success).toBe(true);
    });

    it('should handle timeout', async () => {
      // Mock fetch with AbortError
      (global.fetch as jest.Mock).mockImplementation(() => {
        const error = new Error('Timeout');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const result = await controller.testOidcConnection({
        issuer: 'https://slow-endpoint.example.com',
        clientId: 'test',
        clientSecret: 'test',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('timeout');
    });

    it('should handle invalid discovery document', async () => {
      // Mock fetch returning invalid JSON endpoints
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await controller.testOidcConnection({
        issuer: 'https://invalid.example.com',
        clientId: 'test',
        clientSecret: 'test',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('missing required endpoints');
    });
  });

  describe('testSamlConnection()', () => {
    let cryptoSpy: jest.SpyInstance;

    beforeEach(() => {
      global.fetch = jest.fn();
      const crypto = require('crypto');
      cryptoSpy = jest
        .spyOn(crypto, 'X509Certificate')
        .mockImplementation(() => ({}));
    });

    afterEach(() => {
      if (cryptoSpy) {
        cryptoSpy.mockRestore();
      }
    });

    it('should return success if cert is valid (no metadata)', async () => {
      const result = await controller.testSamlConnection({
        entityId: 'http://idp',
        ssoUrl: 'https://idp/sso',
        x509: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuL',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('SAML configuration is valid');
    });

    it('should handle timeout on metadata fetch', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => {
        const error = new Error('Timeout');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const fakePem = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuL`;

      const result = await controller.testSamlConnection({
        entityId: 'http://idp',
        ssoUrl: 'https://idp/sso',
        x509: fakePem,
        metadataUrl: 'https://idp/metadata',
      });

      expect(result).toEqual({
        success: false,
        message: 'Failed to fetch metadata: Timeout',
      });
    });

    it('should reject invalid X.509 certificate', async () => {
      cryptoSpy.mockImplementationOnce(() => {
        throw new Error('Invalid format');
      });
      const result = await controller.testSamlConnection({
        entityId: 'https://sp.example.com',
        ssoUrl: 'https://idp.example.com/sso',
        x509: 'INVALID_CERTIFICATE_FORMAT',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Certificate parse error');
    });

    it('should validate metadata with EntityDescriptor', async () => {
      const validMetadata = `<?xml version="1.0"?>
        <EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
          <IDPSSODescriptor>
            <SingleSignOnService Binding="..." Location="..."/>
          </IDPSSODescriptor>
        </EntityDescriptor>`;

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => validMetadata,
      });

      const result = await controller.testSamlConnection({
        entityId: 'https://sp.example.com',
        ssoUrl: 'https://idp.example.com/sso',
        x509: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuL',
        metadataUrl: 'https://idp.example.com/metadata',
      });
      expect(result.success).toBe(true);
    });

    it('should reject metadata missing EntityDescriptor', async () => {
      const invalidMetadata = `<?xml version="1.0"?><root></root>`;

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => invalidMetadata,
      });

      const result = await controller.testSamlConnection({
        entityId: 'https://sp.example.com',
        ssoUrl: 'https://idp.example.com/sso',
        x509: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuL',
        metadataUrl: 'https://idp.example.com/metadata',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('EntityDescriptor');
    });

    it('should reject metadata missing SingleSignOnService', async () => {
      const invalidMetadata = `<?xml version="1.0"?>
        <EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
          <IDPSSODescriptor>
            <!-- Missing SingleSignOnService -->
          </IDPSSODescriptor>
        </EntityDescriptor>`;

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => invalidMetadata,
      });

      const result = await controller.testSamlConnection({
        entityId: 'https://sp.example.com',
        ssoUrl: 'https://idp.example.com/sso',
        x509: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuL',
        metadataUrl: 'https://idp.example.com/metadata',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('SingleSignOnService');
    });
  });
});
