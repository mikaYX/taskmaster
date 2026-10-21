import 'reflect-metadata';
import { validate } from './env.validation';

const base = {
  AUTH_SECRET: 'a-secret-that-is-at-least-32-characters-long',
  DATABASE_URL: 'postgresql://taskmaster:pw@localhost:5432/taskmaster',
};

describe('env validation: LOG_LEVEL', () => {
  it('stays unset when not configured, so the level follows NODE_ENV', () => {
    expect(validate({ ...base }).LOG_LEVEL).toBeUndefined();
  });

  it.each(['debug', 'warn', 'silent'])('accepts %s', (level) => {
    expect(validate({ ...base, LOG_LEVEL: level }).LOG_LEVEL).toBe(level);
  });

  it('accepts a level written in capitals', () => {
    expect(validate({ ...base, LOG_LEVEL: ' WARN ' }).LOG_LEVEL).toBe('warn');
  });

  it('refuses an unknown level instead of silently logging at another one', () => {
    expect(() => validate({ ...base, LOG_LEVEL: 'verbose' })).toThrow(
      /Environment validation failed/,
    );
  });
});
