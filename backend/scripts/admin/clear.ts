/**
 * Destructive maintenance script.
 *
 * Removes Azure AD and Google OAuth entries from the `Config` table.
 * Refuse to run unless `CONFIRM_CLEAR=yes` is set, to avoid accidental wipes.
 *
 * Usage:
 *   CONFIRM_CLEAR=yes npx tsx backend/scripts/admin/clear.ts
 */
import { PrismaClient } from "@prisma/client";

if (process.env.CONFIRM_CLEAR !== "yes") {
  console.error(
    "[clear.ts] Refusing to run: set CONFIRM_CLEAR=yes to confirm deletion of auth.azureAd.* and auth.google.* config entries.",
  );
  process.exit(1);
}

const p = new PrismaClient();
Promise.all([
  p.config.deleteMany({ where: { key: { startsWith: "auth.azureAd" } } }),
  p.config.deleteMany({ where: { key: { startsWith: "auth.google" } } })
]).then(console.log).finally(() => p.$disconnect());
