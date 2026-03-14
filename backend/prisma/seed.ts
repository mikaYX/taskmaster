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
        // Default site required for groups (FK groups_site_id_fkey)
        await prisma.site.upsert({
            where: { id: 1 },
            update: {},
            create: {
                id: 1,
                name: 'Default',
                code: 'DEFAULT',
            },
        });
        console.log('✓ Default site ensured');

        const seedGroups = [
            { name: 'SysAdmins', isSystem: true },
            { name: 'Support', isSystem: false },
        ];

        for (const g of seedGroups) {
            const group = await prisma.group.upsert({
                where: { name: g.name },
                update: {},
                create: {
                    name: g.name,
                    isSystem: g.isSystem,
                },
            });
            console.log(`✓ Group ensured: ${group.name}`);
        }

        const seedConfigs = [
            { key: 'app_name', value: 'Taskmaster Modern' },
            { key: 'backup_retention_days', value: '30' },
            { key: 'session_timeout_minutes', value: '60' },
        ];

        for (const c of seedConfigs) {
            await prisma.config.upsert({
                where: { key: c.key },
                update: {},
                create: c,
            });
        }
        console.log('✓ Config ensured');



        const taskCount = await prisma.task.count();
        if (taskCount === 0) {
            await prisma.task.create({
                data: {
                    name: 'Daily Server Status Check',
                    description: 'Daily Server Status Check',
                    periodicity: 'daily',
                    startDate: new Date(),
                    skipWeekends: true,
                },
            });
            console.log('✓ Sample Task created');
        }

        // Admin creation removed — Setup Wizard is the only path
        console.log('');
        console.log('ℹ️  No admin user created. Use the Setup Wizard at /setup to initialize.');
        console.log('');
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main()
    .catch((e) => {
        console.error('Seed failed:', e.message);
        process.exit(1);
    });

