export interface BoardItem {
  taskId: number;
  taskName: string;
  description?: string;
  periodicity: string;
  procedureUrl?: string;
  priority?: string;
  project?: string;
  category?: string;
  isException?: boolean;
  originalInstanceDate?: string;

  instanceDate: string;
  originalDate: string;
  periodStart: string;
  periodEnd: string;
  isShifted: boolean;

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
