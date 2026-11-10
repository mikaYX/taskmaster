import { Test } from '@nestjs/testing';
import { LdapService } from '../auth/ldap.service';
import { safeFetch } from '../common/utils/url-validator.util';
import { SsoConnectionTester } from './sso-connection-tester';

jest.mock('../common/utils/url-validator.util', () => ({
  safeFetch: jest.fn(),
}));

describe('SsoConnectionTester', () => {
  const testConnection = jest.fn();
  let tester: SsoConnectionTester;
  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SsoConnectionTester,
        { provide: LdapService, useValue: { testConnection } },
      ],
    }).compile();
    tester = module.get(SsoConnectionTester);
  });
  it('delegates LDAP unchanged', async () => {
    const dto = { url: 'ldap://example.com', searchBase: 'dc=example,dc=com' };
    testConnection.mockResolvedValue({
      success: false,
      message: 'LDAP unavailable',
    });
    expect(await tester.testLdapConnection(dto)).toEqual({
      success: false,
      message: 'LDAP unavailable',
    });
    expect(testConnection).toHaveBeenCalledWith(dto);
  });
  it('rejects malformed Azure tenants before fetching', async () => {
    expect(
      await tester.testAzureConnection({
        tenantId: '../other',
        clientId: 'id',
        clientSecret: 'secret',
      }),
    ).toEqual({
      success: false,
      message: 'Failed to connect to Azure AD: Invalid tenant format',
    });
    expect(safeFetch).not.toHaveBeenCalled();
  });
  it('rejects malformed SAML certificates before fetching metadata', async () => {
    expect(
      await tester.testSamlConnection({
        entityId: 'https://example.com',
        ssoUrl: 'https://example.com/sso',
        x509: 'invalid',
        metadataUrl: 'https://example.com/metadata',
      }),
    ).toMatchObject({
      success: false,
      message: expect.stringContaining('Certificate parse error:'),
    });
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
