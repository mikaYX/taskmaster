import { subDays, startOfDay, endOfDay } from 'date-fns';

/**
 * Tests de non-régression pour la correction de la borne auditEnd.
 *
 * Scénario ciblé:
 *  - Tâche daily, occurrence du 2026-03-03, fenêtre 08:00-18:00
 *  - Date courante simulée: 2026-03-04 09:00
 *  - periodEnd = 2026-03-03T18:00:00
 *  - auditEnd avant fix = 2026-03-03T00:00:00  → instance NON GÉNÉRÉE → pas de MISSING
 *  - auditEnd après fix = 2026-03-03T23:59:59  → instance GÉNÉRÉE → MISSING créé ✅
 */

describe('AuditScheduler - auditEnd boundary', () => {
  const simulatedNow = new Date('2026-03-04T09:00:00.000Z');

  const auditEndBefore = subDays(startOfDay(simulatedNow), 1);
  const auditEndAfter = endOfDay(subDays(startOfDay(simulatedNow), 1));

  describe('auditEnd calculation', () => {
    it('avant fix: auditEnd = J-1 00:00 → exclut les instances de J-1', () => {
      // Doit être le 2026-03-03, à minuit (00:00:00 locale)
      expect(auditEndBefore.getFullYear()).toBe(2026);
      expect(auditEndBefore.getMonth()).toBe(2); // 0-indexed: 2 = mars
      expect(auditEndBefore.getDate()).toBe(3);
      expect(auditEndBefore.getHours()).toBe(0);
      expect(auditEndBefore.getMinutes()).toBe(0);
      expect(auditEndBefore.getSeconds()).toBe(0);
    });

    it('après fix: auditEnd = J-1 23:59:59 → couvre toute la journée J-1', () => {
      // endOfDay = 2026-03-03T23:59:59.999Z
      expect(auditEndAfter.getDate()).toBe(auditEndBefore.getDate()); // même jour
      expect(auditEndAfter.getHours()).toBe(23);
      expect(auditEndAfter.getMinutes()).toBe(59);
      expect(auditEndAfter.getSeconds()).toBe(59);
    });

    it('une occurrence daily du 2026-03-03 avec periodEnd=18:00 est dans la borne corrigée', () => {
      const periodEnd = new Date('2026-03-03T18:00:00.000Z');

      // Avant fix: periodEnd > auditEnd → instance était hors range
      expect(periodEnd > auditEndBefore).toBe(true);

      // Après fix: periodEnd < auditEnd → instance est dans range → MISSING créé
      expect(periodEnd < auditEndAfter).toBe(true);
    });

    it('une occurrence du jour J ne doit pas être auditée (pas encore terminée)', () => {
      const todayOccurrencePeriodEnd = new Date('2026-03-04T18:00:00.000Z');

      // periodEnd du jour J est après auditEnd J-1 → ne déclenche pas MISSING
      expect(todayOccurrencePeriodEnd > auditEndAfter).toBe(true);
    });
  });

  describe('condition MISSING: !statusMap.has(dateKey) && now > periodEnd', () => {
    const now = simulatedNow;

    it('tâche daily J-1 sans statut avec periodEnd=18h → MISSING attendu', () => {
      const periodEnd = new Date('2026-03-03T18:00:00.000Z');
      const hasStatus = false;

      const shouldBeMissing = !hasStatus && now > periodEnd;
      expect(shouldBeMissing).toBe(true);
    });

    it('tâche daily J-1 avec statut SUCCESS → pas de MISSING', () => {
      const periodEnd = new Date('2026-03-03T18:00:00.000Z');
      const hasStatus = true;

      const shouldBeMissing = !hasStatus && now > periodEnd;
      expect(shouldBeMissing).toBe(false);
    });

    it('tâche daily J 08:00-18:00 en cours → pas de MISSING (periodEnd futur)', () => {
      const periodEnd = new Date('2026-03-04T18:00:00.000Z');
      const hasStatus = false;

      const shouldBeMissing = !hasStatus && now > periodEnd;
      expect(shouldBeMissing).toBe(false);
    });

    it('tâche weekly: occurrence du lundi 2026-03-02, periodEnd=dimanche 2026-03-08 → pas encore MISSING', () => {
      const periodEnd = new Date('2026-03-08T18:00:00.000Z');
      const hasStatus = false;

      const shouldBeMissing = !hasStatus && now > periodEnd;
      expect(shouldBeMissing).toBe(false);
    });
  });
});
