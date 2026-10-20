import { describe, expect, it } from 'vitest';
import { titleKeyForPath } from './route-titles';

describe('titleKeyForPath', () => {
    it.each([
        ['/', 'nav.taskBoard'],
        ['/tasks', 'nav.taskBoard'],
        ['/todos', 'nav.todoList'],
        ['/task-definitions', 'nav.taskDefinitions'],
        ['/task-definitions/12', 'nav.taskDefinitions'],
        ['/task-definitions/12/edit', 'nav.taskDefinitions'],
        ['/task-definitions/new', 'taskWizard.title'],
        ['/task-definitions/archive', 'taskArchive.title'],
        ['/settings', 'nav.settings'],
        ['/admin/audit', 'nav.auditLog'],
        ['/todosx', 'nav.taskBoard'],
    ])('%s -> %s', (path, key) => {
        expect(titleKeyForPath(path)).toBe(key);
    });
});
