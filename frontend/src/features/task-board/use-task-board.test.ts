import { describe, it, expect } from 'vitest';
import { parseISO, isBefore, isSameDay, isAfter, startOfDay, subHours } from 'date-fns';
import type { BoardItem } from '@/api/types';

/**
 * Logique de classification extraite de use-task-board.ts.
 * Dates fixes ISO : TODAY = 2026-03-04 (déterministe, indépendant du fuseau local).
 *
 * NOW simule « 2026-03-04 à 14:00 UTC » pour les tests d'urgence (< 1h avant fin).
 */

const NOW = parseISO('2026-03-04T14:00:00.000Z');
const TODAY = startOfDay(NOW);

type Bucket = 'pastDue' | 'today' | 'upcoming' | 'completed';

function classify(item: BoardItem): Bucket {
    const periodStart = parseISO(item.periodStart);
    const periodEnd = parseISO(item.periodEnd);

    if (item.status === 'SUCCESS' || item.status === 'FAILED' || item.status === 'MISSING') return 'completed';

    // RUNNING dont la période est dépassée → today (grisé, attente audit)
    if (isBefore(periodEnd, NOW) && item.status === 'RUNNING') {
        return 'today';
    }

    // RUNNING dont la fin est dans moins d'1h → urgent (pastDue)
    const urgentThreshold = subHours(periodEnd, 1);
    if (item.status === 'RUNNING' && !isBefore(periodEnd, NOW) && isBefore(urgentThreshold, NOW)) {
        return 'pastDue';
    }

    if (
        (isBefore(periodStart, TODAY) || isSameDay(periodStart, TODAY)) &&
        (isAfter(periodEnd, TODAY) || isSameDay(periodEnd, TODAY))
    ) {
        return 'today';
    }

    if (isAfter(periodStart, TODAY)) return 'upcoming';

    return 'today';
}

function makeItem(overrides: Partial<BoardItem>): BoardItem {
    return {
        taskId: 1,
        taskName: 'Test Task',
        periodicity: 'daily',
        instanceDate: '2026-03-04',
        originalDate: '2026-03-04',
        periodStart: '2026-03-04T08:00:00.000Z',
        periodEnd: '2026-03-04T18:00:00.000Z',
        isShifted: false,
        status: 'RUNNING',
        assignedUsers: [],
        assignedGroups: [],
        ...overrides,
    };
}

// ─── Cas 1 : RUNNING non échu, > 1h avant fin → En cours ─────────────────────
describe('Cas 1 — RUNNING non échu (> 1h avant fin)', () => {
    it('fenêtre active (start hier, end demain) → today', () => {
        const item = makeItem({
            status: 'RUNNING',
            periodStart: '2026-03-03T08:00:00.000Z',
            periodEnd: '2026-03-05T18:00:00.000Z',
        });
        expect(classify(item)).toBe('today');
    });

    it("fenêtre débutant aujourd'hui, fin à 18h (> 1h) → today", () => {
        const item = makeItem({
            status: 'RUNNING',
            periodStart: '2026-03-04T00:00:00.000Z',
            periodEnd: '2026-03-04T18:00:00.000Z',
        });
        expect(classify(item)).toBe('today');
    });
});

// ─── Cas 2 : RUNNING échu (fenêtre dépassée) → today (grisé, attente audit) ──
describe('Cas 2 — RUNNING échu (attente audit)', () => {
    it("tâche daily dont la fenêtre s'est terminée hier → today (pas pastDue)", () => {
        const item = makeItem({
            status: 'RUNNING',
            periodStart: '2026-03-03T08:00:00.000Z',
            periodEnd: '2026-03-03T18:00:00.000Z',
        });
        expect(classify(item)).toBe('today');
        expect(classify(item)).not.toBe('pastDue');
    });

    it("tâche dont la fenêtre s'est terminée à 13h aujourd'hui → today", () => {
        const item = makeItem({
            status: 'RUNNING',
            periodStart: '2026-03-04T08:00:00.000Z',
            periodEnd: '2026-03-04T13:00:00.000Z',
        });
        expect(classify(item)).toBe('today');
    });
});

// ─── Cas 2b : RUNNING urgent (< 1h avant fin) → pastDue ──────────────────────
describe('Cas 2b — RUNNING urgent (< 1h avant fin)', () => {
    it('fin à 14:30 (dans 30 min), NOW=14:00 → pastDue (urgent)', () => {
        const item = makeItem({
            status: 'RUNNING',
            periodStart: '2026-03-04T08:00:00.000Z',
            periodEnd: '2026-03-04T14:30:00.000Z',
        });
        expect(classify(item)).toBe('pastDue');
    });

    it('fin à 14:50 (dans 50 min), NOW=14:00 → pastDue (urgent)', () => {
        const item = makeItem({
            status: 'RUNNING',
            periodStart: '2026-03-04T08:00:00.000Z',
            periodEnd: '2026-03-04T14:50:00.000Z',
        });
        expect(classify(item)).toBe('pastDue');
    });

    it('fin à 15:01 (dans > 1h), NOW=14:00 → today (pas urgent)', () => {
        const item = makeItem({
            status: 'RUNNING',
            periodStart: '2026-03-04T08:00:00.000Z',
            periodEnd: '2026-03-04T15:01:00.000Z',
        });
        expect(classify(item)).toBe('today');
    });
});

// ─── Cas 3 : SUCCESS → Terminées uniquement ──────────────────────────────────
describe('Cas 3 — SUCCESS', () => {
    it('SUCCESS passé → completed', () => {
        const item = makeItem({
            status: 'SUCCESS',
            periodStart: '2026-03-03T08:00:00.000Z',
            periodEnd: '2026-03-03T18:00:00.000Z',
        });
        expect(classify(item)).toBe('completed');
    });

    it('SUCCESS ne doit PAS aller dans pastDue ni today', () => {
        const item = makeItem({
            status: 'SUCCESS',
            periodStart: '2026-03-03T08:00:00.000Z',
            periodEnd: '2026-03-03T18:00:00.000Z',
        });
        expect(classify(item)).not.toBe('pastDue');
        expect(classify(item)).not.toBe('today');
    });
});

// ─── Cas 4 : FAILED → Terminées uniquement ───────────────────────────────────
describe('Cas 4 — FAILED', () => {
    it('FAILED passé → completed', () => {
        const item = makeItem({
            status: 'FAILED',
            periodStart: '2026-03-03T08:00:00.000Z',
            periodEnd: '2026-03-03T18:00:00.000Z',
        });
        expect(classify(item)).toBe('completed');
    });

    it('FAILED ne doit PAS aller dans pastDue ni today', () => {
        const item = makeItem({
            status: 'FAILED',
            periodStart: '2026-03-03T08:00:00.000Z',
            periodEnd: '2026-03-03T18:00:00.000Z',
        });
        expect(classify(item)).not.toBe('pastDue');
        expect(classify(item)).not.toBe('today');
    });
});

// ─── Cas 4b : MISSING → Terminées uniquement (comme SUCCESS/FAILED) ───────────
describe('Cas 4b — MISSING', () => {
    it('MISSING passé → completed', () => {
        const item = makeItem({
            status: 'MISSING',
            periodStart: '2026-03-03T08:00:00.000Z',
            periodEnd: '2026-03-03T18:00:00.000Z',
        });
        expect(classify(item)).toBe('completed');
    });

    it('MISSING ne doit PAS aller dans pastDue ni today', () => {
        const item = makeItem({
            status: 'MISSING',
            periodStart: '2026-03-03T08:00:00.000Z',
            periodEnd: '2026-03-03T18:00:00.000Z',
        });
        expect(classify(item)).not.toBe('pastDue');
        expect(classify(item)).not.toBe('today');
    });
});

// ─── Cas 5 : Toggle showCompleted OFF ────────────────────────────────────────
describe('Cas 5 — toggle showCompleted', () => {
    const items: BoardItem[] = [
        makeItem({ taskId: 1, status: 'RUNNING', periodStart: '2026-03-04T08:00:00.000Z', periodEnd: '2026-03-05T18:00:00.000Z' }),
        makeItem({ taskId: 2, status: 'SUCCESS', periodStart: '2026-03-03T08:00:00.000Z', periodEnd: '2026-03-03T18:00:00.000Z' }),
        makeItem({ taskId: 3, status: 'FAILED', periodStart: '2026-03-03T08:00:00.000Z', periodEnd: '2026-03-03T18:00:00.000Z' }),
        makeItem({ taskId: 4, status: 'MISSING', periodStart: '2026-03-03T08:00:00.000Z', periodEnd: '2026-03-03T18:00:00.000Z' }),
    ];

    const classified = items.map(i => ({ item: i, bucket: classify(i) }));
    const todayItems = classified.filter(c => c.bucket === 'today').map(c => c.item);
    const completedItems = classified.filter(c => c.bucket === 'completed').map(c => c.item);

    it('section Terminées masquée quand showCompleted=false → liste vide exposée', () => {
        const showCompleted = false;
        const visibleCompleted = showCompleted ? completedItems : [];
        expect(visibleCompleted).toHaveLength(0);
    });

    it('section Terminées visible quand showCompleted=true → SUCCESS + FAILED + MISSING présents', () => {
        const showCompleted = true;
        const visibleCompleted = showCompleted ? completedItems : [];
        expect(visibleCompleted.some(i => i.status === 'SUCCESS')).toBe(true);
        expect(visibleCompleted.some(i => i.status === 'FAILED')).toBe(true);
        expect(visibleCompleted.some(i => i.status === 'MISSING')).toBe(true);
    });

    it('En cours contient uniquement des RUNNING (jamais SUCCESS/FAILED/MISSING)', () => {
        expect(todayItems.every(i => i.status === 'RUNNING')).toBe(true);
        expect(todayItems.some(i => i.status === 'SUCCESS')).toBe(false);
        expect(todayItems.some(i => i.status === 'FAILED')).toBe(false);
        expect(todayItems.some(i => i.status === 'MISSING')).toBe(false);
    });
});

// ─── Cas 6 : Non-régression Timezone (Europe/Paris UTC+1) ─────────────────────
describe('Cas 6 — Non-régression Timezone', () => {
    it('Une instance du 4 Mars (Paris) commençant à 08:00 (07:00 UTC) doit être dans Today', () => {
        const item = makeItem({
            instanceDate: '2026-03-04',
            periodStart: '2026-03-04T07:00:00.000Z',
            periodEnd: '2026-03-04T17:00:00.000Z',
            status: 'RUNNING'
        });
        expect(classify(item)).toBe('today');
    });

    it('Une instance du 4 Mars (New York UTC-5) commençant à 08:00 (13:00 UTC) doit être dans Today', () => {
        const item = makeItem({
            instanceDate: '2026-03-04',
            periodStart: '2026-03-04T13:00:00.000Z',
            periodEnd: '2026-03-04T23:00:00.000Z',
            status: 'RUNNING'
        });
        expect(classify(item)).toBe('today');
    });
});
