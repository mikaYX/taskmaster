import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyStrategy } from './api-key.strategy';
import { ApiKeysService } from '../api-keys.service';
import { AuthService } from '../auth.service';
import { UnauthorizedException } from '@nestjs/common';

describe('ApiKeyStrategy', () => {
  let strategy: ApiKeyStrategy;
  let apiKeysService: ApiKeysService;

  const mockApiKeysService = {
    validateKey: jest.fn(),
  };

  const mockAuthService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyStrategy,
        { provide: ApiKeysService, useValue: mockApiKeysService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    strategy = module.get<ApiKeyStrategy>(ApiKeyStrategy);
    apiKeysService = module.get<ApiKeysService>(ApiKeysService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('should validate and return principal', async () => {
    const apiKey = 'sk_12345';
    const mockKeyEntity = {
      id: 1,
      keyPrefix: 'sk_12345',
      scopes: ['TASK_READ'],
    };
    mockApiKeysService.validateKey.mockResolvedValue(mockKeyEntity);

    const done = jest.fn();
    await strategy.validate(apiKey, done);

    expect(apiKeysService.validateKey).toHaveBeenCalledWith(apiKey);
    expect(done).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        id: 'apikey:1',
        role: 'API_KEY',
        permissions: ['TASK_READ'],
      }),
    );
  });

  it('should fail if key is invalid', async () => {
    mockApiKeysService.validateKey.mockResolvedValue(null);
    const done = jest.fn();
    await strategy.validate('invalid', done);

    expect(done).toHaveBeenCalledWith(null, false);
  });
});
