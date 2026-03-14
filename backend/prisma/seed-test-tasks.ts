/**
 * Script de seed pour créer des tâches de test couvrant toutes les situations
 * du tableau de bord : En retard, Aujourd'hui, À venir, Terminées.
 *
 * Usage : cd backend && npm run db:seed-test-tasks
 * (Charge .env depuis backend/ ou la racine du projet.)
 */
import * as path from 'path';
import { config } from 'dotenv';

// Charger .env depuis backend/ puis racine projet (pour npm run depuis backend)
config({ path: path.join(process.cwd(), '.env') });
if (!process.env.DATABASE_URL) {
    config({ path: path.join(process.cwd(), '..', '.env') });
}

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { addDays, subDays, format } from 'date-fns';

const PROCEDURE_URL = 'https://google.fr';

function dateStr(d: Date): string {
    return format(d, 'yyyy-MM-dd');
}

async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not defined');

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = subDays(today, 1);
    const twoDaysAgo = subDays(today, 2);
    const threeDaysAgo = subDays(today, 3);
    const oneWeekAgo = subDays(today, 7);
    const twoWeeksAgo = subDays(today, 14);
    const lastMonth = subDays(today, 35);
    const tomorrow = addDays(today, 1);
    const nextWeek = addDays(today, 7);
    const nextMonth = addDays(today, 32);

    // Jour de la semaine actuel (0=Sun, 1=Mon, ..., 6=Sat)
    const todayDow = today.getDay();
    const dowNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const todayByDay = dowNames[todayDow];

    try {
        console.log('🌱 Suppression des tâches de test précédentes…');

        // Supprimer les anciennes tâches de test (via préfixe du nom)
        await prisma.task.deleteMany({
            where: { name: { startsWith: '[TEST]' } },
        });

        // Premier utilisateur (souvent l'admin) : on lui assigne toutes les tâches de test pour pouvoir changer leur statut
        const firstUser = await prisma.user.findFirst({ orderBy: { id: 'asc' } });
        const assignUserId = firstUser?.id ?? null;
        if (!assignUserId || !firstUser) {
            console.warn('⚠ Aucun utilisateur en base : les tâches de test ne seront assignées à personne (seul un ADMIN pourra changer leur statut).');
        } else {
            console.log(`✓ Tâches de test assignées à l'utilisateur id=${assignUserId} (${firstUser.username ?? firstUser.email ?? '—'})`);
        }

        const assignToFirstUser = async (taskId: number) => {
            if (assignUserId == null) return;
            await prisma.taskAssignment.upsert({
                where: { taskId_userId: { taskId, userId: assignUserId } },
                create: { taskId, userId: assignUserId, siteId: 1 },
                update: {},
            });
        };

        console.log(`\n📅 Aujourd'hui : ${dateStr(today)} (${dowNames[todayDow]})\n`);

        // ─────────────────────────────────────────────────────────────────
        // BUCKET : AUJOURD'HUI (RUNNING, périodStart ≤ today ≤ periodEnd)
        // ─────────────────────────────────────────────────────────────────

        const taskDaily = await prisma.task.create({
            data: {
                name: '[TEST] Test Task Daily',
                description: 'Tâche quotidienne — apparaît chaque jour (en cours aujourd\'hui + en retard sur les jours passés)',
                periodicity: 'daily',
                rrule: 'FREQ=DAILY',
                startDate: oneWeekAgo,
                skipWeekends: false,
                skipHolidays: false,
                priority: 'MEDIUM',
                procedureUrl: PROCEDURE_URL,
                category: 'Test',
                project: 'Projet Demo',
                siteId: 1,
            },
        });
        await assignToFirstUser(taskDaily.id);
        console.log(`✓ [Aujourd'hui + En retard] Test Task Daily (id=${taskDaily.id})`);

        const taskWorkingDays = await prisma.task.create({
            data: {
                name: '[TEST] Test Task Working Days',
                description: 'Tâche jours ouvrés (Lundi–Vendredi) — ignorée les weekends',
                periodicity: 'daily',
                rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR',
                startDate: twoWeeksAgo,
                skipWeekends: true,
                skipHolidays: false,
                priority: 'HIGH',
                procedureUrl: PROCEDURE_URL,
                category: 'Test',
                project: 'Projet Demo',
                siteId: 1,
            },
        });
        await assignToFirstUser(taskWorkingDays.id);
        console.log(`✓ [En retard + Jours ouvrés] Test Task Working Days (id=${taskWorkingDays.id})`);

        // Tâche hebdomadaire qui tombe aujourd'hui (même jour de la semaine)
        const taskWeeklyToday = await prisma.task.create({
            data: {
                name: '[TEST] Test Task Weekly (aujourd\'hui)',
                description: `Tâche hebdomadaire qui tombe le jour actuel (${todayByDay}) — visible "Aujourd'hui"`,
                periodicity: 'weekly',
                rrule: `FREQ=WEEKLY;BYDAY=${todayByDay}`,
                startDate: twoWeeksAgo,
                skipWeekends: false,
                skipHolidays: false,
                priority: 'LOW',
                procedureUrl: PROCEDURE_URL,
                category: 'Test',
                project: 'Projet Demo',
                siteId: 1,
            },
        });
        await assignToFirstUser(taskWeeklyToday.id);
        console.log(`✓ [Aujourd'hui] Test Task Weekly Today (id=${taskWeeklyToday.id})`);

        // Tâche mensuelle tombant le jour du mois actuel
        const dayOfMonth = today.getDate();
        const taskMonthlyToday = await prisma.task.create({
            data: {
                name: '[TEST] Test Task Monthly (aujourd\'hui)',
                description: `Tâche mensuelle le ${dayOfMonth} du mois — visible "Aujourd'hui"`,
                periodicity: 'monthly',
                rrule: `FREQ=MONTHLY;BYMONTHDAY=${dayOfMonth}`,
                startDate: lastMonth,
                skipWeekends: false,
                skipHolidays: false,
                priority: 'CRITICAL',
                procedureUrl: PROCEDURE_URL,
                category: 'Test',
                project: 'Projet Demo',
                siteId: 1,
            },
        });
        await assignToFirstUser(taskMonthlyToday.id);
        console.log(`✓ [Aujourd'hui] Test Task Monthly Today (id=${taskMonthlyToday.id})`);

        // Tâche "une seule fois" pour aujourd'hui
        const taskOnce = await prisma.task.create({
            data: {
                name: '[TEST] Test Task Once (aujourd\'hui)',
                description: 'Tâche ponctuelle — occurrence unique aujourd\'hui',
                periodicity: 'once',
                startDate: today,
                skipWeekends: false,
                skipHolidays: false,
                priority: 'HIGH',
                procedureUrl: PROCEDURE_URL,
                category: 'Test',
                project: 'Projet Demo',
                siteId: 1,
            },
        });
        await assignToFirstUser(taskOnce.id);
        console.log(`✓ [Aujourd'hui] Test Task Once (id=${taskOnce.id})`);

        // ─────────────────────────────────────────────────────────────────
        // BUCKET : EN RETARD (RUNNING, periodEnd < today)
        // ─────────────────────────────────────────────────────────────────

        // Tâche hebdomadaire un autre jour → seules les occurrences passées, prochaine dans le futur
        const nextDow = (todayDow + 2) % 7; // 2 jours après aujourd'hui
        const nextDowName = dowNames[nextDow];
        const pastDow = (todayDow + 5) % 7; // 5 jours après = 2 jours avant
        const pastDowName = dowNames[pastDow];

        const taskWeeklyPastDue = await prisma.task.create({
            data: {
                name: '[TEST] Test Task Weekly (en retard)',
                description: `Tâche hebdomadaire le ${pastDowName} — occurrences passées en retard, prochaine à venir`,
                periodicity: 'weekly',
                rrule: `FREQ=WEEKLY;BYDAY=${pastDowName}`,
                startDate: twoWeeksAgo,
                skipWeekends: false,
                skipHolidays: false,
                priority: 'MEDIUM',
                procedureUrl: PROCEDURE_URL,
                category: 'Test',
                project: 'Projet Demo',
                siteId: 1,
            },
        });
        await assignToFirstUser(taskWeeklyPastDue.id);
        console.log(`✓ [En retard + À venir] Test Task Weekly PastDue (id=${taskWeeklyPastDue.id})`);

        // ─────────────────────────────────────────────────────────────────
        // BUCKET : À VENIR (RUNNING, periodStart > today)
        // ─────────────────────────────────────────────────────────────────

        const taskUpcomingWeekly = await prisma.task.create({
            data: {
                name: '[TEST] Test Task Weekly (à venir)',
                description: `Tâche hebdomadaire le ${nextDowName} — prochaine occurrence dans 2 jours`,
                periodicity: 'weekly',
                rrule: `FREQ=WEEKLY;BYDAY=${nextDowName}`,
                startDate: tomorrow,
                skipWeekends: false,
                skipHolidays: false,
                priority: 'LOW',
                procedureUrl: PROCEDURE_URL,
                category: 'Test',
                project: 'Projet Demo',
                siteId: 1,
            },
        });
        console.log(`✓ [À venir] Test Task Weekly Upcoming (id=${taskUpcomingWeekly.id})`);

        const taskQuarterly = await prisma.task.create({
            data: {
                name: '[TEST] Test Task Quarterly',
                description: 'Tâche trimestrielle — toutes les 3 semaines pour test (ou mensuel interval=3)',
                periodicity: 'monthly',
                rrule: 'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1',
                startDate: new Date('2026-01-01'),
                skipWeekends: false,
                skipHolidays: false,
                priority: 'HIGH',
                procedureUrl: PROCEDURE_URL,
                category: 'Test',
                project: 'Projet Demo',
                siteId: 1,
            },
        });
        await assignToFirstUser(taskQuarterly.id);
        console.log(`✓ [En retard + À venir] Test Task Quarterly (id=${taskQuarterly.id})`);

        const taskYearly = await prisma.task.create({
            data: {
                name: '[TEST] Test Task Yearly',
                description: 'Tâche annuelle — chaque 1er janvier',
                periodicity: 'yearly',
                rrule: 'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1',
                startDate: new Date('2025-01-01'),
                skipWeekends: false,
                skipHolidays: false,
                priority: 'CRITICAL',
                procedureUrl: PROCEDURE_URL,
                category: 'Test',
                project: 'Projet Demo',
                siteId: 1,
            },
        });
        console.log(`✓ [En retard + À venir] Test Task Yearly (id=${taskYearly.id})`);

        const taskFutureOnce = await prisma.task.create({
            data: {
                name: '[TEST] Test Task Once (à venir)',
                description: 'Tâche ponctuelle dans le futur — visible "À venir"',
                periodicity: 'once',
                startDate: nextWeek,
                skipWeekends: false,
                skipHolidays: false,
                priority: 'MEDIUM',
                procedureUrl: PROCEDURE_URL,
                category: 'Test',
                project: 'Projet Demo',
                siteId: 1,
            },
        });
        await assignToFirstUser(taskFutureOnce.id);
        console.log(`✓ [À venir] Test Task Once Future (id=${taskFutureOnce.id})`);

        // ─────────────────────────────────────────────────────────────────
        // BUCKET : TERMINÉES (SUCCESS / FAILED / MISSING)
        // Ces statuts sont créés manuellement dans la table Status
        // ─────────────────────────────────────────────────────────────────

        const taskSuccess = await prisma.task.create({
            data: {
                name: '[TEST] Test Task SUCCESS',
                description: 'Tâche avec occurrence d\'hier marquée SUCCESS — visible dans "Terminées"',
                periodicity: 'daily',
                rrule: 'FREQ=DAILY',
                startDate: threeDaysAgo,
                skipWeekends: false,
                skipHolidays: false,
                priority: 'MEDIUM',
                procedureUrl: PROCEDURE_URL,
                category: 'Test',
                project: 'Projet Demo',
                siteId: 1,
            },
        });
        await prisma.status.create({
            data: {
                taskId: taskSuccess.id,
                instanceDate: yesterday,
                status: 'SUCCESS',
                comment: 'Validé automatiquement par le seed de test',
            },
        });
        console.log(`✓ [Terminée - SUCCESS] Test Task SUCCESS (id=${taskSuccess.id})`);

        const taskFailed = await prisma.task.create({
            data: {
                name: '[TEST] Test Task FAILED',
                description: 'Tâche avec occurrence d\'avant-hier marquée FAILED — visible dans "Terminées"',
                periodicity: 'daily',
                rrule: 'FREQ=DAILY',
                startDate: threeDaysAgo,
                skipWeekends: false,
                skipHolidays: false,
                priority: 'HIGH',
                procedureUrl: PROCEDURE_URL,
                category: 'Test',
                project: 'Projet Demo',
                siteId: 1,
            },
        });
        await prisma.status.create({
            data: {
                taskId: taskFailed.id,
                instanceDate: twoDaysAgo,
                status: 'FAILED',
                comment: 'Marquée en échec par le seed de test',
            },
        });
        await assignToFirstUser(taskFailed.id);
        console.log(`✓ [Terminée - FAILED] Test Task FAILED (id=${taskFailed.id})`);

        const taskMissing = await prisma.task.create({
            data: {
                name: '[TEST] Test Task MISSING',
                description: 'Tâche avec occurrence d\'hier marquée MISSING — visible dans "Terminées" (toggle actif)',
                periodicity: 'daily',
                rrule: 'FREQ=DAILY',
                startDate: threeDaysAgo,
                skipWeekends: false,
                skipHolidays: false,
                priority: 'LOW',
                procedureUrl: PROCEDURE_URL,
                category: 'Test',
                project: 'Projet Demo',
                siteId: 1,
            },
        });
        await prisma.status.create({
            data: {
                taskId: taskMissing.id,
                instanceDate: yesterday,
                status: 'MISSING',
                comment: 'Manquée — seed de test',
            },
        });
        console.log(`✓ [Terminée - MISSING] Test Task MISSING (id=${taskMissing.id})`);

        // Tâche hebdomadaire complète (SUCCESS hier)
        const taskWeeklySuccess = await prisma.task.create({
            data: {
                name: '[TEST] Test Task Weekly (terminée)',
                description: 'Tâche hebdomadaire avec dernière occurrence SUCCESS',
                periodicity: 'weekly',
                rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU',
                startDate: twoWeeksAgo,
                skipWeekends: false,
                skipHolidays: false,
                priority: 'LOW',
                procedureUrl: PROCEDURE_URL,
                category: 'Test',
                project: 'Projet Demo',
                siteId: 1,
            },
        });
        await prisma.status.create({
            data: {
                taskId: taskWeeklySuccess.id,
                instanceDate: yesterday,
                status: 'SUCCESS',
                comment: 'Terminée avec succès',
            },
        });
        await assignToFirstUser(taskWeeklySuccess.id);
        console.log(`✓ [Terminée - SUCCESS] Test Task Weekly Done (id=${taskWeeklySuccess.id})`);

        console.log('\n✅ Toutes les tâches de test ont été créées avec succès !');
        console.log('\n📊 Résumé des buckets attendus dans le tableau de bord :');
        console.log('  ⏰ En retard    : Test Task Daily (jours passés), Test Task Working Days, Test Task Weekly PastDue, Test Task Quarterly (jan 1), Test Task Yearly (jan 1, 2025)');
        console.log('  📅 Aujourd\'hui : Test Task Daily (aujourd\'hui), Test Task Weekly Today, Test Task Monthly Today, Test Task Once (today)');
        console.log('  🔮 À venir     : Test Task Weekly Upcoming, Test Task Quarterly (avr 1), Test Task Yearly (jan 2027), Test Task Once Future');
        console.log('  ✅ Terminées   : Test Task SUCCESS, Test Task FAILED, Test Task MISSING, Test Task Weekly Done (toggle requis)');
        console.log('\n🔗 URL procédure : https://google.fr (toutes les tâches)');

    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch((e) => {
    console.error('❌ Seed test-tasks failed:', e.message);
    process.exit(1);
});
