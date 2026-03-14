import { TaskStatus } from '@prisma/client';

/**
 * Status response DTO with audit information.
 */
export class StatusResponseDto {
  id!: number;
  taskId!: number;
  instanceDate!: Date;
  status!: TaskStatus;
  comment!: string | null;
  updatedByUserId!: number | null;
  updatedByUsername!: string | null;
  updatedAt!: Date;
  taskDescription?: string;
}

/**
 * Maps a Prisma Status to StatusResponseDto.
 */
export function toStatusResponse(status: {
  id: number;
  taskId: number;
  instanceDate: Date;
  status: TaskStatus;
  comment: string | null;
  updatedByUserId: number | null;
  updatedByUsername: string | null;
  updatedAt: Date;
  task?: { description: string };
}): StatusResponseDto {
  return {
    id: status.id,
    taskId: status.taskId,
    instanceDate: status.instanceDate,
    status: status.status,
    comment: status.comment,
    updatedByUserId: status.updatedByUserId,
    updatedByUsername: status.updatedByUsername,
    updatedAt: status.updatedAt,
    taskDescription: status.task?.description,
  };
}
