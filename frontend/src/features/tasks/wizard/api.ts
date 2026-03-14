import { http } from "@/api/http";
import type { CreateTaskDto } from "@/api/types";

export interface VirtualInstance {
    taskId: number;
    date: string; // ISO Date String
    originalDate: string; // ISO Date String
    periodicity: string;
    periodStart?: string;
    periodEnd?: string;
}

export const wizardApi = {
    previewTask: (dto: CreateTaskDto) => http.post<VirtualInstance[]>('/tasks/preview', dto),
    // We can reuse tasksApi.create or define it here for completeness
    createTask: (dto: CreateTaskDto) => http.post<void>('/tasks', dto),
};
