import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error('DATABASE_URL is not defined');
    }

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    try {
        await prisma.config.upsert({
            where: { key: 'RECURRENCE_V2_ENABLED' },
            update: { value: 'true' },
            create: { key: 'RECURRENCE_V2_ENABLED', value: 'true' },
        });

        await prisma.config.upsert({
            where: { key: 'FROM_COMPLETION_ENABLED' },
            update: { value: 'true' },
            create: { key: 'FROM_COMPLETION_ENABLED', value: 'true' },
        });

        console.log('✓ V2 & FROM_COMPLETION settings activated');
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch(console.error);
