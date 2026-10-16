import type { Prisma } from '@prisma/client';
export class BoardItem {
  taskId: number;
  taskName: string;
  description?: string;
  periodicity: string;
  procedureUrl?: string;
  executionChecklist?: Prisma.JsonValue;
  executionRecord?: Prisma.JsonValue;
  priority?: string;
  project?: string;
  category?: string;

  instanceDate: string;
  originalDate: string;
  periodStart: string;
  periodEnd: string;
  isShifted: boolean;
  isException?: boolean;
  originalInstanceDate?: string;

  status: 'SUCCESS' | 'FAILED' | 'MISSING' | 'RUNNING';
  validation?: {
    byUserId: number;
    byUsername: string;
    validatedAt: string;
    comment?: string;
  };

  assignedUsers: { id: number; name: string }[];
  assignedGroups: { id: number; name: string }[];
}
