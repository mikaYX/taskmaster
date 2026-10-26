import { loadSiteCountryResolver } from './site-country';

describe('loadSiteCountryResolver', () => {
  const prisma = {
    site: {
      findMany: jest.fn().mockResolvedValue([{ id: 2, country: 'US' }]),
    },
  };

  it("uses the site's own country when set", async () => {
    const resolve = await loadSiteCountryResolver(prisma as never, 'FR');
    expect(resolve(2)).toBe('US');
  });

  it('falls back to the global country otherwise', async () => {
    const resolve = await loadSiteCountryResolver(prisma as never, 'FR');
    expect(resolve(1)).toBe('FR');
    expect(resolve(undefined)).toBe('FR');
  });
});
