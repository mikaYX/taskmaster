import { backendApiUrl } from './backend-url';

describe('backendApiUrl', () => {
  const original = process.env.BACKEND_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = original;
  });

  it.each([
    'https://taskmaster.example.com',
    'https://taskmaster.example.com/',
    'https://taskmaster.example.com/api',
    'https://taskmaster.example.com/api/',
  ])('puts the API prefix once, whatever the form of %s', (backendUrl) => {
    process.env.BACKEND_URL = backendUrl;
    expect(backendApiUrl('/auth/azure/callback')).toBe(
      'https://taskmaster.example.com/api/auth/azure/callback',
    );
  });

  it('falls back to the local backend', () => {
    delete process.env.BACKEND_URL;
    expect(backendApiUrl('/auth/saml/acs')).toBe(
      'http://localhost:3000/api/auth/saml/acs',
    );
  });

  it('keeps a port and a path prefix of the site', () => {
    process.env.BACKEND_URL = 'https://example.com:8443/taskmaster';
    expect(backendApiUrl('auth/saml/acs')).toBe(
      'https://example.com:8443/taskmaster/api/auth/saml/acs',
    );
  });
});
