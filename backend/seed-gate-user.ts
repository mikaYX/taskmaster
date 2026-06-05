import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Seed a service account used only by the auth release gate (CI smoke tests).
 *
 * Refuses to run unless SMOKE_USERNAME and SMOKE_PASSWORD are provided
 * explicitly, so that a stale default password can never end up in any
 * environment (especially production).
 */
async function main() {
  const username = process.env.SMOKE_USERNAME;
  const password = process.env.SMOKE_PASSWORD;

  if (!username || !password) {
    console.error(
      '[SEED] Refusing to seed: SMOKE_USERNAME and SMOKE_PASSWORD must both be set.',
    );
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('[SEED] SMOKE_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[SEED] Refusing to seed gate user in production (NODE_ENV=production).',
    );
    process.exit(1);
  }

  console.log('[SEED] Ajout du compte de service Auth Release Gate...');
  const hash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { username },
    update: { passwordHash: hash },
    create: {
      email: 'gate@local',
      username,
      passwordHash: hash,
      role: 'USER',
      fullname: 'Quality Gate Service Account',
    },
  });

  console.log('[SEED] Succès ✅');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
