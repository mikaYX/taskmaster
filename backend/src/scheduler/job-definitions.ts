export interface JobDefinition {
  readonly name: string;
  readonly cron: string;
  readonly description: string;
  readonly lockTtlSeconds: number;
}

export const JOB_DEFINITIONS = {
  'auto-backup': {
    name: 'auto-backup',
    cron: '* * * * *',
    description: 'Scheduled system backup',
    lockTtlSeconds: 1800,
  },
  'auto-export': {
    name: 'auto-export',
    cron: '* * * * *',
    description: 'Scheduled data export',
    lockTtlSeconds: 1800,
  },
  'cleanup-audit-logs': {
    name: 'cleanup-audit-logs',
    cron: '0 4 * * *',
    description: 'Removes expired audit logs',
    lockTtlSeconds: 300,
  },
  'cleanup-backups': {
    name: 'cleanup-backups',
    cron: '0 3 * * *',
    description: 'Removes old backups',
    lockTtlSeconds: 300,
  },
  'cleanup-exports': {
    name: 'cleanup-exports',
    cron: '0 2 * * *',
    description: 'Removes expired export files',
    lockTtlSeconds: 300,
  },
  'cleanup-refresh-tokens': {
    name: 'cleanup-refresh-tokens',
    cron: '15 4 * * *',
    description: 'Removes expired and revoked refresh tokens',
    lockTtlSeconds: 300,
  },
  'health-check': {
    name: 'health-check',
    cron: '*/5 * * * *',
    description: 'System health monitoring',
    lockTtlSeconds: 300,
  },
  'email-alerts': {
    name: 'email-alerts',
    cron: '0 * * * *',
    description: 'Missing task alerts',
    lockTtlSeconds: 300,
  },
  'email-reminders': {
    name: 'email-reminders',
    cron: '*/15 * * * *',
    description: 'Task due reminders',
    lockTtlSeconds: 300,
  },
  'todo-maintenance': {
    name: 'todo-maintenance',
    cron: '10 0 * * *',
    description: 'Todolist upkeep: removes old notifications of the bell',
    lockTtlSeconds: 300,
  },
  'todo-reminders': {
    name: 'todo-reminders',
    cron: '0 * * * *',
    description:
      'Todolist due-date reminders (hourly digest: bell, pop-up, email)',
    lockTtlSeconds: 300,
  },
  'audit-producer': {
    name: 'audit-producer',
    cron: '0 */5 * * * *',
    description:
      'Detects past task occurrences with no status and marks them MISSING (runs every 5 min + at startup)',
    lockTtlSeconds: 600,
  },
  'delegation-expiry': {
    name: 'delegation-expiry',
    cron: '*/1 * * * *',
    description: 'Notify users about expired delegations',
    lockTtlSeconds: 300,
  },
} as const satisfies Record<string, JobDefinition>;
