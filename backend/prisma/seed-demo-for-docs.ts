/**
 * Demo seed for the docs and screenshots: realistic task names, a mix of
 * periodicities and priorities, three operators and 30 days of status history
 * so the Analytics charts are filled.
 *
 * Run it on a throwaway database, after the setup wizard created the admin:
 *   cd backend && npm run db:seed-demo
 * Re-running it replaces the demo tasks and users it created before.
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
import { addDays, subDays } from 'date-fns';
import type {
  Prisma,
  TaskStatus,
  TodoPriority,
  TodoScope,
} from '@prisma/client';

/** Marks the demo tasks, so a re-run replaces them. */
const PROCEDURE_URL = 'https://example.com/procedures';

const OPERATORS = [
  { username: 'alex.martin', fullname: 'Alex Martin' },
  { username: 'sam.chen', fullname: 'Sam Chen' },
  { username: 'jordan.lee', fullname: 'Jordan Lee' },
];

type DemoTask = Omit<
  Prisma.TaskUncheckedCreateInput,
  'startDate' | 'siteId'
> & {
  /** Index in OPERATORS of the user who validates it (the admin otherwise). */
  operator?: number;
  /** Share of successful occurrences in the history, 0-100. */
  successRate: number;
};

const TASKS: DemoTask[] = [
  {
    name: 'Daily safety walkthrough',
    description:
      'Check emergency exits and fire extinguishers. Every working day.',
    periodicity: 'daily',
    rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR',
    skipWeekends: true,
    skipHolidays: true,
    priority: 'HIGH',
    category: 'Safety',
    project: 'Compliance',
    operator: 0,
    successRate: 88,
  },
  {
    name: 'Morning operations briefing',
    description: 'Shift handover and daily stand-up with the team.',
    periodicity: 'daily',
    rrule: 'FREQ=DAILY',
    priority: 'MEDIUM',
    category: 'Operations',
    project: 'Management',
    successRate: 95,
  },
  {
    name: 'Server room temperature check',
    description:
      'Record temperature and humidity, check the air conditioning alarms.',
    periodicity: 'daily',
    rrule: 'FREQ=DAILY',
    priority: 'HIGH',
    category: 'IT',
    project: 'Infrastructure',
    operator: 1,
    successRate: 80,
  },
  {
    name: 'Backup verification',
    description:
      'Restore a sample file from last night backup and log the result.',
    periodicity: 'daily',
    rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR',
    skipWeekends: true,
    priority: 'CRITICAL',
    category: 'IT',
    project: 'Infrastructure',
    operator: 1,
    successRate: 55,
  },
  {
    name: 'Weekly quality audit',
    description: 'Quality audit on a production sample. Every Monday.',
    periodicity: 'weekly',
    rrule: 'FREQ=WEEKLY;BYDAY=MO',
    priority: 'CRITICAL',
    category: 'Quality',
    project: 'Production',
    operator: 2,
    successRate: 85,
  },
  {
    name: 'Technical area cleaning',
    description:
      'Clean the technical rooms. Twice a week (Tuesday and Friday).',
    periodicity: 'weekly',
    rrule: 'FREQ=WEEKLY;BYDAY=TU,FR',
    priority: 'LOW',
    category: 'Facilities',
    project: 'Environment',
    operator: 2,
    successRate: 90,
  },
  {
    name: 'Monthly equipment inspection',
    description:
      'Inventory and test safety equipment (alarms, detectors). First day of the month.',
    periodicity: 'monthly',
    rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
    priority: 'HIGH',
    category: 'Maintenance',
    project: 'Safety',
    operator: 0,
    successRate: 100,
  },
  {
    name: 'Quarterly compliance review',
    description:
      'Regulatory compliance review. Every 3 months, first day of the quarter.',
    periodicity: 'monthly',
    rrule: 'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1',
    priority: 'CRITICAL',
    category: 'Compliance',
    project: 'Regulatory',
    successRate: 100,
  },
];

/** Settings the screenshots show, stored JSON-encoded like the settings service does. */
const SETTINGS: Record<string, string> = {
  'ui.language': 'en',
  'app.country': 'US',
};

const TODOS: {
  title: string;
  priority: TodoPriority;
  scope?: TodoScope;
  dueInDays: number;
}[] = [
  {
    title: 'Order replacement fire extinguisher',
    priority: 'URGENT',
    dueInDays: 1,
  },
  {
    title: 'Renew the alarm maintenance contract',
    priority: 'HIGH',
    dueInDays: 3,
  },
  {
    title: 'Update the evacuation plan in the lobby',
    priority: 'NORMAL',
    dueInDays: 7,
  },
  {
    title: 'Restock the first aid kits',
    scope: 'COLLECTIVE',
    priority: 'NORMAL',
    dueInDays: 2,
  },
  {
    title: 'Plan the quarterly safety training',
    scope: 'COLLECTIVE',
    priority: 'LOW',
    dueInDays: 14,
  },
];

const COMMENTS: Record<TaskStatus, string> = {
  SUCCESS: 'Done, nothing to report',
  FAILED: 'Issue found, ticket opened',
  MISSING: 'Not done',
  RUNNING: 'In progress',
};

/** Deterministic pseudo-random status, so every run draws the same charts. */
function pickStatus(seed: number, successRate: number): TaskStatus {
  const r = (seed * 37 + 11) % 100;
  if (r < successRate) return 'SUCCESS';
  return r % 2 === 0 ? 'FAILED' : 'MISSING';
}

/** Days within the last 30 on which the task has an occurrence. */
function occurrenceDays(task: DemoTask, today: Date): Date[] {
  const days: Date[] = [];
  for (let i = 30; i >= 1; i--) {
    const day = subDays(today, i);
    const weekday = day.getDay();
    const rrule = task.rrule ?? '';
    if (rrule.includes('MONTHLY')) {
      if (day.getDate() === 1) days.push(day);
    } else if (rrule.includes('WEEKLY')) {
      if (
        (rrule.includes('MO') && weekday === 1) ||
        (rrule.includes('TU') && weekday === 2) ||
        (rrule.includes('FR') && weekday === 5)
      ) {
        days.push(day);
      }
    } else if (!rrule.includes('BYDAY') || (weekday !== 0 && weekday !== 6)) {
      days.push(day);
    }
  }
  return days;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not defined');

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const admin = await prisma.user.findFirst({ orderBy: { id: 'asc' } });
    if (!admin) {
      console.warn(
        'No user in the database. Create the admin through /setup, then run this seed again.',
      );
      return;
    }

    await prisma.task.deleteMany({ where: { procedureUrl: PROCEDURE_URL } });
    await prisma.user.deleteMany({
      where: { username: { in: OPERATORS.map((o) => o.username) } },
    });

    const operators = [];
    for (const o of OPERATORS) {
      operators.push(
        await prisma.user.create({
          data: {
            ...o,
            email: `${o.username}@example.com`,
            sites: { create: { siteId: 1, isDefault: true } },
          },
        }),
      );
    }

    for (const [key, value] of Object.entries(SETTINGS)) {
      const stored = JSON.stringify(value);
      await prisma.config.upsert({
        where: { key },
        create: { key, value: stored },
        update: { value: stored },
      });
    }

    await prisma.todo.deleteMany({
      where: { title: { in: TODOS.map((todo) => todo.title) } },
    });
    for (const { dueInDays, ...todo } of TODOS) {
      await prisma.todo.create({
        data: { ...todo, dueDate: addDays(today, dueInDays), userId: admin.id },
      });
    }

    let statusCount = 0;
    for (const [index, { operator, successRate, ...data }] of TASKS.entries()) {
      const user = operator === undefined ? admin : operators[operator];
      const task = await prisma.task.create({
        data: {
          ...data,
          procedureUrl: PROCEDURE_URL,
          startDate: subDays(today, 60),
          siteId: 1,
          userAssignments: { create: { userId: user.id, siteId: 1 } },
        },
      });

      for (const [day, instanceDate] of occurrenceDays(
        TASKS[index],
        today,
      ).entries()) {
        const status = pickStatus(day + index * 7, successRate);
        await prisma.status.create({
          data: {
            taskId: task.id,
            instanceDate,
            status,
            comment: COMMENTS[status],
            updatedByUserId: user.id,
            updatedByUsername: user.username,
          },
        });
        statusCount++;
      }
    }

    console.log(
      `Demo seed done: ${TASKS.length} tasks, ${OPERATORS.length} operators, ${TODOS.length} todos, ${statusCount} statuses.`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Demo seed failed:', e.message);
  process.exit(1);
});
