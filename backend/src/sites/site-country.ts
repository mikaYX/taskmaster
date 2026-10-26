import type { PrismaClient } from '@prisma/client';

/** Countries supported for holiday computation (mirrors the `app.country` options). */
export const SUPPORTED_COUNTRIES = ['FR', 'US', 'GB', 'DE', 'ES'] as const;

/**
 * Builds a lookup returning the holiday country of a site: its own country
 * when set, otherwise the global `app.country` fallback.
 */
export async function loadSiteCountryResolver(
  prisma: PrismaClient,
  fallback: string,
): Promise<(siteId?: number | null) => string> {
  const sites = await prisma.site.findMany({
    where: { country: { not: null } },
    select: { id: true, country: true },
  });
  const byId = new Map(sites.map((s) => [s.id, s.country as string]));
  return (siteId) => (siteId != null && byId.get(siteId)) || fallback;
}
