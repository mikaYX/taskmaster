/**
 * Seed « démo » pour la doc et les captures d'écran : tâches aux noms métier,
 * variété de périodicité et criticité, et historique de statuts sur 30 jours
 * pour remplir les graphiques Analytics.
 *
 * Usage : cd backend && npx ts-node -r tsconfig-paths/register prisma/seed-demo-for-docs.ts
 * Ou : npm run db:seed-demo (si le script est ajouté au package.json)
 */
import * as path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env') });
if (!process.env.DATABASE_URL) {
  config({ path: path.join(process.cwd(), '..', '.env') });
}

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { addDays, subDays, format } from 'date-fns';
import type { TaskStatus } from '@prisma/client';

const PROCEDURE_URL = 'https://example.com/procedures';

function dateStr(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Répartition réaliste pour remplir les courbes : ~75% SUCCESS, ~12% FAILED, ~10% MISSING, ~3% RUNNING */
function pickStatusForDay(dayIndex: number): TaskStatus {
  const r = (dayIndex * 17 + 31) % 100;
  if (r < 75) return 'SUCCESS';
  if (r < 87) return 'FAILED';
  if (r < 97) return 'MISSING';
  return 'RUNNING';
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
  const thirtyDaysAgo = subDays(today, 30);

  try {
    console.log('🌱 Seed démo pour docs/screenshots…\n');

    const firstUser = await prisma.user.findFirst({ orderBy: { id: 'asc' } });
    const assignUserId = firstUser?.id ?? null;
    if (!assignUserId || !firstUser) {
      console.warn('⚠ Aucun utilisateur en base. Créez un admin via /setup puis relancez le seed.');
      return;
    }
    console.log(`✓ Utilisateur cible : ${firstUser.username ?? firstUser.email} (id=${assignUserId})\n`);

    const assign = async (taskId: number) => {
      await prisma.taskAssignment.upsert({
        where: { taskId_userId: { taskId, userId: assignUserId } },
        create: { taskId, userId: assignUserId, siteId: 1 },
        update: {},
      });
    };

    // Supprimer les anciennes tâches [DEMO] (cascade supprime status + assignments)
    const deleted = await prisma.task.deleteMany({
      where: { name: { startsWith: '[DEMO]' } },
    });
    if (deleted.count > 0) console.log(`✓ ${deleted.count} ancienne(s) tâche(s) [DEMO] supprimée(s)\n`);

    const startPast = subDays(today, 60);

    // ─── Tâches métier variées (périodicité + priorité) ────────────────────

    const t1 = await prisma.task.create({
      data: {
        name: '[DEMO] Ronde de sécurité quotidienne',
        description: 'Contrôle des issues de sécurité et des extincteurs. À effectuer chaque jour ouvré.',
        periodicity: 'daily',
        rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR',
        startDate: startPast,
        skipWeekends: true,
        skipHolidays: true,
        priority: 'HIGH',
        procedureUrl: PROCEDURE_URL,
        category: 'Sécurité',
        project: 'Conformité',
        siteId: 1,
      },
    });
    await assign(t1.id);
    console.log('✓ [DEMO] Ronde de sécurité quotidienne (daily, HIGH)');

    const t2 = await prisma.task.create({
      data: {
        name: '[DEMO] Contrôle qualité hebdomadaire',
        description: 'Audit qualité sur un échantillon de production. Tous les lundis.',
        periodicity: 'weekly',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        startDate: startPast,
        skipWeekends: false,
        skipHolidays: false,
        priority: 'CRITICAL',
        procedureUrl: PROCEDURE_URL,
        category: 'Qualité',
        project: 'Production',
        siteId: 1,
      },
    });
    await assign(t2.id);
    console.log('✓ [DEMO] Contrôle qualité hebdomadaire (weekly, CRITICAL)');

    const t3 = await prisma.task.create({
      data: {
        name: '[DEMO] Vérification mensuelle des équipements',
        description: 'Inventaire et test des équipements de sécurité (alarmes, détecteurs). 1er du mois.',
        periodicity: 'monthly',
        rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
        startDate: startPast,
        skipWeekends: false,
        skipHolidays: false,
        priority: 'HIGH',
        procedureUrl: PROCEDURE_URL,
        category: 'Maintenance',
        project: 'Sécurité',
        siteId: 1,
      },
    });
    await assign(t3.id);
    console.log('✓ [DEMO] Vérification mensuelle des équipements (monthly, HIGH)');

    const t4 = await prisma.task.create({
      data: {
        name: '[DEMO] Point quotidien opérations',
        description: 'Tour de plage et point avec l’équipe. Tous les jours.',
        periodicity: 'daily',
        rrule: 'FREQ=DAILY',
        startDate: startPast,
        skipWeekends: false,
        skipHolidays: false,
        priority: 'MEDIUM',
        procedureUrl: PROCEDURE_URL,
        category: 'Opérations',
        project: 'Pilotage',
        siteId: 1,
      },
    });
    await assign(t4.id);
    console.log('✓ [DEMO] Point quotidien opérations (daily, MEDIUM)');

    const t5 = await prisma.task.create({
      data: {
        name: '[DEMO] Revue trimestrielle conformité',
        description: 'Revue de conformité réglementaire. Tous les 3 mois (1er jour du trimestre).',
        periodicity: 'monthly',
        rrule: 'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1',
        startDate: new Date(today.getFullYear(), 0, 1),
        skipWeekends: false,
        skipHolidays: false,
        priority: 'CRITICAL',
        procedureUrl: PROCEDURE_URL,
        category: 'Conformité',
        project: 'Réglementaire',
        siteId: 1,
      },
    });
    await assign(t5.id);
    console.log('✓ [DEMO] Revue trimestrielle conformité (monthly interval=3, CRITICAL)');

    const t6 = await prisma.task.create({
      data: {
        name: '[DEMO] Nettoyage des zones techniques',
        description: 'Nettoyage des locaux techniques. Deux fois par semaine (mardi et vendredi).',
        periodicity: 'weekly',
        rrule: 'FREQ=WEEKLY;BYDAY=TU,FR',
        startDate: startPast,
        skipWeekends: false,
        skipHolidays: false,
        priority: 'LOW',
        procedureUrl: PROCEDURE_URL,
        category: 'Hygiène',
        project: 'Environnement',
        siteId: 1,
      },
    });
    await assign(t6.id);
    console.log('✓ [DEMO] Nettoyage des zones techniques (weekly TU,FR, LOW)');

    // ─── Historique de statuts sur 30 jours (pour Analytics) ───────────────
    // On remplit pour les tâches quotidiennes + une hebdo pour avoir des points variés

    const tasksForHistory = [t1, t4]; // deux daily pour beaucoup de points
    let statusCount = 0;

    for (const task of tasksForHistory) {
      for (let i = 0; i <= 30; i++) {
        const instanceDate = subDays(today, 30 - i);
        const status = pickStatusForDay(i);
        await prisma.status.upsert({
          where: {
            taskId_instanceDate: { taskId: task.id, instanceDate },
          },
          create: {
            taskId: task.id,
            instanceDate,
            status,
            comment: status === 'SUCCESS' ? 'Effectué' : status === 'FAILED' ? 'Non conforme' : status === 'MISSING' ? 'Non réalisé' : 'En attente',
          },
          update: { status },
        });
        statusCount++;
      }
    }

    // Quelques statuts pour la tâche hebdo (4–5 occurrences sur 30 j)
    for (let w = 0; w < 5; w++) {
      const instanceDate = subDays(today, w * 7);
      if (instanceDate >= thirtyDaysAgo) {
        const status: TaskStatus = w === 0 ? 'RUNNING' : w === 1 ? 'MISSING' : 'SUCCESS';
        await prisma.status.upsert({
          where: {
            taskId_instanceDate: { taskId: t2.id, instanceDate },
          },
          create: {
            taskId: t2.id,
            instanceDate,
            status,
            comment: status === 'SUCCESS' ? 'Contrôle effectué' : status === 'MISSING' ? 'Non réalisé' : 'En cours',
          },
          update: { status },
        });
        statusCount++;
      }
    }

    console.log(`\n✓ ${statusCount} enregistrements de statut créés (30 derniers jours) pour les graphiques Analytics.`);
    console.log('\n✅ Seed démo terminé. Vous pouvez lancer l’app et ouvrir /tasks, /analytics et /task-definitions pour les captures.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('❌ Seed demo failed:', e.message);
  process.exit(1);
});
