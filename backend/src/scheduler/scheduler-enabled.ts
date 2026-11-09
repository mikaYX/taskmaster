import type { SettingsService } from '../settings/settings.service';
import { SETTINGS_REGISTRY } from '../settings/settings.registry';

export async function isSchedulerEnabled(
  settings: Pick<SettingsService, 'getRawValue'>,
): Promise<boolean> {
  const value =
    (await settings.getRawValue<unknown>('scheduler.enabled')) ??
    SETTINGS_REGISTRY['scheduler.enabled'].default;
  return value === true || value === 'true';
}
