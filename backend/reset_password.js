
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
    try {
        const passwordHash = await bcrypt.hash('admin123', 12);
        const user = await prisma.user.update({
            where: { username: 'admin' },
            data: { passwordHash },
        });
        console.log(`Admin password reset for user: ${user.username}`);
    } catch (e) {
        console.error('Error resetting password:', e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
