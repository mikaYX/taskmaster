import type { PrismaService } from '../prisma';
import type { SettingsService } from '../settings/settings.service';
import { SETTINGS_REGISTRY } from '../settings/settings.registry';
import { loadSiteCountryResolver } from '../sites/site-country';
import { loadFromCompletionContext } from '../scheduler/from-completion-context';
import type { InstanceService } from './instance.service';

/** Shared inputs; callers retain ownership of their computation and history windows. */
export async function loadPlanningContext(
  client: PrismaService['client'],
  settings: SettingsService,
) {
  const [country, enabled, start, end] = await Promise.all([
    settings.getRawValue<string>('app.country'),
    settings.getRawValue<boolean>('FROM_COMPLETION_ENABLED'),
    settings.getRawValue<string>('SCHEDULE_DEFAULT_START_TIME'),
    settings.getRawValue<string>('SCHEDULE_DEFAULT_END_TIME'),
  ]);
  const countryForSite = await loadSiteCountryResolver(
    client,
    country || SETTINGS_REGISTRY['app.country'].default,
  );
  const windowDefaults = {
    start: start || SETTINGS_REGISTRY.SCHEDULE_DEFAULT_START_TIME.default,
    end: end || SETTINGS_REGISTRY.SCHEDULE_DEFAULT_END_TIME.default,
  };
  return {
    countryForSite,
    windowDefaults,
    async fromCompletion(
      task: Pick<
        Parameters<InstanceService['computeInstances']>[0],
        'id' | 'recurrenceMode' | 'rrule'
      >,
      start: Date,
      end: Date,
    ) {
      return (enabled ?? SETTINGS_REGISTRY.FROM_COMPLETION_ENABLED.default) &&
        task.recurrenceMode === 'FROM_COMPLETION' &&
        task.rrule
        ? loadFromCompletionContext(client, task.id, start, end)
        : undefined;
    },
  };
}
