import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysService } from './api-keys.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Focused unit tests for AUDIT.md Finding #2 (partial fix):
 *
 * The hash format (unsalted SHA-256) is intentionally unchanged in this PR —
 * a full migration to bcrypt/Argon2id is tracked separately because it
 * requires forced rotation of every existing API key.
 *
 * These tests verify the constant-time comparison swap-in:
 *  - correct keys still validate
 *  - wrong keys are rejected
 *  - malformed / mismatched-length hashes never throw
 */
describe('ApiKeysService (AUDIT #2 partial — timingSafeEqual)', () => {
  let service: ApiKeysService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        {
          provide: PrismaService,
          useValue: { client: {} },
        },
      ],
    }).compile();
    service = module.get<ApiKeysService>(ApiKeysService);
  });

  it('verifyHash returns true for a matching key/hash pair', () => {
    const key = 'sk_' + 'a'.repeat(64);
    const hash = (service as any).hashKey(key) as string;
    expect((service as any).verifyHash(key, hash)).toBe(true);
  });

  it('verifyHash returns false for a non-matching key', () => {
    const key = 'sk_' + 'a'.repeat(64);
    const otherKey = 'sk_' + 'b'.repeat(64);
    const hash = (service as any).hashKey(key) as string;
    expect((service as any).verifyHash(otherKey, hash)).toBe(false);
  });

  it('verifyHash returns false (does not throw) when the stored hash has a wrong length', () => {
    const key = 'sk_' + 'a'.repeat(64);
    expect(() => (service as any).verifyHash(key, 'deadbeef')).not.toThrow();
    expect((service as any).verifyHash(key, 'deadbeef')).toBe(false);
  });

  it('verifyHash returns false when the stored hash contains non-hex chars', () => {
    const key = 'sk_' + 'a'.repeat(64);
    const malformed = 'z'.repeat(64); // same length as SHA-256 hex but invalid
    expect(() => (service as any).verifyHash(key, malformed)).not.toThrow();
    expect((service as any).verifyHash(key, malformed)).toBe(false);
  });
});
