import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    const config = await prisma.config.findMany({
        where: { key: { in: ['RECURRENCE_V2_ENABLED', 'FROM_COMPLETION_ENABLED'] } }
    });
    console.log(JSON.stringify(config, null, 2));

    await prisma.$disconnect();
    await pool.end();
}

main().catch(console.error);
