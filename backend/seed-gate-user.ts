import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('[SEED] Ajout du compte de service Auth Release Gate...');
  const hash = await bcrypt.hash(
    process.env.SMOKE_PASSWORD || 'gate_password123',
    10,
  );

  await prisma.user.upsert({
    where: { username: process.env.SMOKE_USERNAME || 'testgateuser' },
    update: { passwordHash: hash },
    create: {
      email: 'gate@local',
      username: process.env.SMOKE_USERNAME || 'testgateuser',
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
