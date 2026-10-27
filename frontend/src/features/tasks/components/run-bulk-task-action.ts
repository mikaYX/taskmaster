import type { Task } from '@/api/types';

export interface BulkTaskOutcome {
    done: number;
    failed: { name: string; reason: string }[];
}

/**
 * Runs one request per task and keeps going when some fail: the server checks rights and state
 * task by task, so a refusal on one task must not hide what happened to the others.
 */
export async function runBulkTaskAction(
    tasks: Pick<Task, 'id' | 'name'>[],
    action: (id: number) => Promise<unknown>,
): Promise<BulkTaskOutcome> {
    const results = await Promise.allSettled(tasks.map(task => action(task.id)));
    const failed = results.flatMap((result, index) => {
        if (result.status === 'fulfilled') return [];
        const error = result.reason as { response?: { data?: { message?: string } }; message?: string };
        return [{ name: tasks[index].name, reason: error.response?.data?.message ?? error.message ?? '' }];
    });
    return { done: results.length - failed.length, failed };
}
