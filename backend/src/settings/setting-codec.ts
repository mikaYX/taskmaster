import { Logger } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import {
  SETTINGS_REGISTRY,
  SettingKey,
  SettingValue,
} from './settings.registry';

const logger = new Logger('SettingsCodec');

export const SENSITIVE_PLACEHOLDER = '••••••••';

export function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function encodeSetting(
  key: SettingKey,
  value: unknown,
  encryption: EncryptionService,
): string {
  const serialized = JSON.stringify(SETTINGS_REGISTRY[key].schema.parse(value));
  return SETTINGS_REGISTRY[key].sensitive
    ? encryption.encrypt(serialized)
    : serialized;
}

export function decodeSetting<K extends SettingKey>(
  key: K,
  raw: string | undefined,
  encryption: EncryptionService,
): SettingValue<K>;
export function decodeSetting(
  key: SettingKey,
  raw: string | undefined,
  encryption: EncryptionService,
): SettingValue<SettingKey> {
  const config = SETTINGS_REGISTRY[key];
  if (raw === undefined) return config.schema.parse(config.default);
  const plaintext =
    config.sensitive && encryption.isEncrypted(raw)
      ? encryption.decrypt(raw)
      : raw;
  const parsed = config.schema.safeParse(parseValue(plaintext));
  if (parsed.success) return parsed.data;
  // Legacy setup rows contain raw strings, including true/false for string schemas.
  const legacy = config.schema.safeParse(plaintext);
  if (legacy.success) return legacy.data;
  // A value stored under an older, looser schema must not make the settings page or a
  // job fail: read the default instead. The log names the key, never the value.
  logger.warn(`Stored value of ${key} is not valid; using its default`);
  return config.schema.parse(config.default);
}

export function presentSetting(
  key: SettingKey,
  value: unknown,
  { stored }: { stored: boolean },
): unknown {
  return SETTINGS_REGISTRY[key].sensitive
    ? stored
      ? SENSITIVE_PLACEHOLDER
      : ''
    : value;
}
