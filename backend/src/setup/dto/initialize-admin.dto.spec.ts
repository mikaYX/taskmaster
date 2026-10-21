import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { InitializeAdminDto } from './initialize-admin.dto';

async function invalidFields(body: Record<string, unknown>) {
  const dto = plainToInstance(InitializeAdminDto, {
    username: 'admin@example.com',
    password: 'Str0ng-Passw0rd-2026!',
    ...body,
  });
  return (await validate(dto)).map((error) => error.property);
}

describe('InitializeAdminDto preferences', () => {
  it('accepts a supported language and an IANA time zone', async () => {
    await expect(
      invalidFields({ language: 'en', timezone: 'Europe/Paris' }),
    ).resolves.toEqual([]);
  });

  it('accepts a request without preferences', async () => {
    await expect(invalidFields({})).resolves.toEqual([]);
  });

  it('rejects an unsupported language', async () => {
    await expect(invalidFields({ language: 'de' })).resolves.toEqual([
      'language',
    ]);
  });

  it('rejects a time zone that does not exist', async () => {
    await expect(invalidFields({ timezone: 'Mars/Olympus' })).resolves.toEqual([
      'timezone',
    ]);
  });
});
