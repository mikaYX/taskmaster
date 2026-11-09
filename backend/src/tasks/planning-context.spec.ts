import { loadPlanningContext } from './planning-context';
import { SETTINGS_REGISTRY } from '../settings/settings.registry';
import type { PrismaService } from '../prisma';
import type { SettingsService } from '../settings/settings.service';

describe('loadPlanningContext', () => {
  it('uses registry defaults and site overrides without loading history for ordinary tasks', async () => {
    const findFirst = jest.fn();
    const client = {
      site: {
        findMany: jest.fn().mockResolvedValue([{ id: 2, country: 'DE' }]),
      },
      status: { findFirst },
    } as unknown as PrismaService['client'];
    const settings = {
      getRawValue: jest.fn().mockResolvedValue(undefined),
    } as unknown as SettingsService;
    const context = await loadPlanningContext(client, settings);
    expect(context.countryForSite(null)).toBe(
      SETTINGS_REGISTRY['app.country'].default,
    );
    expect(context.countryForSite(2)).toBe('DE');
    expect(context.windowDefaults).toEqual({
      start: SETTINGS_REGISTRY.SCHEDULE_DEFAULT_START_TIME.default,
      end: SETTINGS_REGISTRY.SCHEDULE_DEFAULT_END_TIME.default,
    });
    expect(
      await context.fromCompletion(
        { id: 1, recurrenceMode: 'FIXED', rrule: null },
        new Date(),
        new Date(),
      ),
    ).toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'loads history only when enabled (%s), using the caller window',
    async (enabled) => {
      const start = new Date('2026-05-01T00:00:00Z');
      const end = new Date('2026-05-04T23:59:59Z');
      const status = {
        findFirst: jest.fn().mockResolvedValue({ updatedAt: start }),
        count: jest.fn().mockResolvedValue(1),
      };
      const client = {
        site: { findMany: jest.fn().mockResolvedValue([]) },
        status,
      };
      const values: Record<string, unknown> = {
        FROM_COMPLETION_ENABLED: enabled,
        'app.country': 'GB',
        SCHEDULE_DEFAULT_START_TIME: '09:00',
        SCHEDULE_DEFAULT_END_TIME: '17:00',
      };
      const context = await loadPlanningContext(
        client as unknown as PrismaService['client'],
        {
          getRawValue: (key: string) => Promise.resolve(values[key]),
        } as SettingsService,
      );
      expect(context.countryForSite(99)).toBe('GB');
      expect(context.windowDefaults).toEqual({ start: '09:00', end: '17:00' });
      const history = await context.fromCompletion(
        { id: 3, recurrenceMode: 'FROM_COMPLETION', rrule: 'FREQ=DAILY' },
        start,
        end,
      );
      if (enabled) {
        expect(history).toEqual({
          lastTerminalDate: start,
          hasRunningInstance: true,
        });
        expect(status.count).toHaveBeenCalledWith({
          where: {
            taskId: 3,
            status: 'RUNNING',
            instanceDate: { gte: start, lte: end },
          },
        });
      } else {
        expect(history).toBeUndefined();
        expect(status.findFirst).not.toHaveBeenCalled();
        expect(status.count).not.toHaveBeenCalled();
      }
    },
  );
});
