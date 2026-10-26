import { PrismaService } from './prisma.service';

type Ctx = { user?: unknown; selectedSiteId?: number };

const serviceFor = (ctx: Ctx) => {
  // Bypass the constructor: it opens a database pool and is irrelevant here.
  const service = Object.create(PrismaService.prototype) as PrismaService;
  (service as unknown as { cls: unknown }).cls = {
    get: (key: keyof Ctx) => ctx[key],
  };
  return service;
};

const user = (role: string) => ({
  id: 1,
  role,
  sites: [
    { siteId: 1, isDefault: true },
    { siteId: 2, isDefault: false },
  ],
});

describe('PrismaService.getCurrentSiteId', () => {
  it('prefers the selected site when the user belongs to it', () => {
    const s = serviceFor({ user: user('USER'), selectedSiteId: 2 });
    expect(s.getCurrentSiteId()).toBe(2);
  });

  it('ignores a selected site the user is not assigned to', () => {
    const s = serviceFor({ user: user('MANAGER'), selectedSiteId: 99 });
    expect(s.getCurrentSiteId()).toBe(1);
  });

  it('falls back to the default site when nothing is selected', () => {
    const s = serviceFor({ user: user('USER') });
    expect(s.getCurrentSiteId()).toBe(1);
  });

  it('lets a super admin pick any site', () => {
    const s = serviceFor({ user: user('SUPER_ADMIN'), selectedSiteId: 99 });
    expect(s.getCurrentSiteId()).toBe(99);
  });

  it('returns undefined without a user', () => {
    expect(serviceFor({}).getCurrentSiteId()).toBeUndefined();
  });
});
