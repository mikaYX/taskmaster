import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';
import { decodeSetting, encodeSetting, presentSetting } from './setting-codec';
import {
  booleanSetting,
  SETTINGS_REGISTRY,
  SETTING_KEYS,
} from './settings.registry';

describe('setting codec and registry', () => {
  const encryption = new EncryptionService(
    new ConfigService({ AUTH_SECRET: 'test-secret-at-least-16' }),
  );
  it.each(SETTING_KEYS)('default satisfies schema: %s', (key) => {
    expect(
      SETTINGS_REGISTRY[key].schema.safeParse(SETTINGS_REGISTRY[key].default)
        .success,
    ).toBe(true);
  });
  it.each([true, false, 'true', 'false'])(
    'accepts boolean input %s',
    (value) => {
      expect(typeof booleanSetting.parse(value)).toBe('boolean');
    },
  );
  it.each(['yes', '', 'TRUE', '0', 0, 1, null, undefined])(
    'rejects non-boolean input %s',
    (value) => {
      expect(booleanSetting.safeParse(value).success).toBe(false);
    },
  );
  it('encrypts and decodes secrets and presents their storage state', () => {
    const raw = encodeSetting('email.smtp.password', 'secret', encryption);
    expect(raw).not.toContain('secret');
    expect(decodeSetting('email.smtp.password', raw, encryption)).toBe(
      'secret',
    );
    expect(
      presentSetting('email.smtp.password', 'secret', { stored: true }),
    ).toBe('••••••••');
    expect(presentSetting('email.smtp.password', '', { stored: false })).toBe(
      '',
    );
  });
  it('falls back to the default when a stored value no longer fits its schema', () => {
    // A stricter schema in a later release must not make the settings page or a job fail.
    expect(decodeSetting('email.smtp.port', '"not-a-port"', encryption)).toBe(
      SETTINGS_REGISTRY['email.smtp.port'].default,
    );
    expect(decodeSetting('email.smtp.port', '70000', encryption)).toBe(
      SETTINGS_REGISTRY['email.smtp.port'].default,
    );
    expect(decodeSetting('email.enabled', '"maybe"', encryption)).toBe(
      SETTINGS_REGISTRY['email.enabled'].default,
    );
  });
  it('names the key but never the value in the log when a stored value is invalid', () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    expect(decodeSetting('email.smtp.port', '"hunter2"', encryption)).toBe(
      SETTINGS_REGISTRY['email.smtp.port'].default,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).toContain('email.smtp.port');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('hunter2');
    warn.mockRestore();
  });
  it('still fails loudly when a stored secret cannot be decrypted', () => {
    const foreign = new EncryptionService(
      new ConfigService({ AUTH_SECRET: 'another-secret-16-chars' }),
    ).encrypt(JSON.stringify('hunter2'));
    expect(() =>
      decodeSetting('email.smtp.password', foreign, encryption),
    ).toThrow();
  });
  it('reads raw and JSON encoded legacy booleans', () => {
    for (const raw of ['true', '"true"'])
      expect(decodeSetting('email.enabled', raw, encryption)).toBe(true);
    expect(decodeSetting('auth.passkeys.enabled', 'true', encryption)).toBe(
      'true',
    );
  });
});
