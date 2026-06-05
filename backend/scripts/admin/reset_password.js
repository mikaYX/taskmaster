/**
 * Destructive maintenance script.
 *
 * Resets the local password of the `admin` user.
 * Refuses to run unless:
 *   - CONFIRM_RESET=yes (explicit confirmation)
 *   - ADMIN_NEW_PASSWORD is set to a strong value
 *
 * Usage:
 *   CONFIRM_RESET=yes ADMIN_NEW_PASSWORD='...' node backend/scripts/admin/reset_password.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
require('dotenv').config();

if (process.env.CONFIRM_RESET !== 'yes') {
    console.error("[reset_password] Refusing to run: set CONFIRM_RESET=yes to confirm.");
    process.exit(1);
}

const newPassword = process.env.ADMIN_NEW_PASSWORD;
if (!newPassword || newPassword.length < 12) {
    console.error("[reset_password] ADMIN_NEW_PASSWORD must be set and >= 12 chars.");
    process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
    try {
        const passwordHash = await bcrypt.hash(newPassword, 12);
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
