import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PasskeysController } from './passkeys.controller';
import { PasskeysService } from './passkeys.service';
import { AuthService } from './auth.service';
import { User } from '@prisma/client';
import { Role } from '../enums/role.enum';

describe('PasskeysController', () => {
  let controller: PasskeysController;
  let passkeysService: jest.Mocked<PasskeysService>;
  let authService: jest.Mocked<AuthService>;

  const mockUser: any = {
    id: 1,
    username: 'testuser',
    fullname: null,
    email: null,
    passwordHash: 'hash',
    role: Role.USER,
    authProvider: 'LOCAL',
    externalId: null,
    mustChangePassword: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PasskeysController],
      providers: [
        {
          provide: PasskeysService,
          useValue: {
            generateRegistrationOptions: jest.fn(),
            verifyRegistration: jest.fn(),
            generateAuthenticationOptions: jest.fn(),
            verifyAuthentication: jest.fn(),
            listPasskeys: jest.fn(),
            deletePasskey: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            completeLogin: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'NODE_ENV') return 'test';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<PasskeysController>(PasskeysController);
    passkeysService = module.get(PasskeysService);
    authService = module.get(AuthService);
  });

  it('should generate registration options', async () => {
    const mockOptions = { challenge: 'abc' };
    passkeysService.generateRegistrationOptions.mockResolvedValue(
      mockOptions as any,
    );

    const result = await controller.generateRegistrationOptions(mockUser);
    expect(passkeysService.generateRegistrationOptions).toHaveBeenCalledWith(
      mockUser,
    );
    expect(result).toEqual(mockOptions);
  });

  it('should verify registration', async () => {
    const req = {} as any;
    passkeysService.verifyRegistration.mockResolvedValue({ verified: true });

    const result = await controller.verifyRegistration(
      mockUser,
      { response: { data: 'res' }, name: 'My Key' },
      req,
    );
    expect(passkeysService.verifyRegistration).toHaveBeenCalledWith(
      mockUser,
      { data: 'res' },
      'My Key',
      req,
    );
    expect(result).toEqual({ verified: true });
  });

  it('should generate authentication options', async () => {
    const mockOptions = {
      options: { challenge: 'def' },
      sessionId: 'session123',
    };
    passkeysService.generateAuthenticationOptions.mockResolvedValue(
      mockOptions as any,
    );

    const result = await controller.generateAuthenticationOptions();
    expect(passkeysService.generateAuthenticationOptions).toHaveBeenCalled();
    expect(result).toEqual(mockOptions);
  });

  it('should verify authentication', async () => {
    const req = {} as any;
    passkeysService.verifyAuthentication.mockResolvedValue(mockUser);
    authService.completeLogin.mockResolvedValue({
      accessToken: 'token',
    } as any);

    const result = await controller.verifyAuthentication(
      { response: { data: 'auth' }, sessionId: 'session123' },
      req,
    );
    expect(passkeysService.verifyAuthentication).toHaveBeenCalledWith(
      { data: 'auth' },
      'session123',
      req,
    );
    expect(authService.completeLogin).toHaveBeenCalledWith(mockUser.id);
    expect(result).toEqual({ accessToken: 'token' });
  });

  it('should list passkeys', async () => {
    const mockPasskeys = [{ id: '1', name: 'My Key' }];
    passkeysService.listPasskeys.mockResolvedValue(mockPasskeys as any);

    const result = await controller.listPasskeys(mockUser);
    expect(passkeysService.listPasskeys).toHaveBeenCalledWith(mockUser.id);
    expect(result).toEqual(mockPasskeys);
  });

  it('should delete passkey', async () => {
    passkeysService.deletePasskey.mockResolvedValue({ success: true });

    const result = await controller.deletePasskey(mockUser, 'passkey-123');
    expect(passkeysService.deletePasskey).toHaveBeenCalledWith(
      mockUser.id,
      'passkey-123',
    );
    expect(result).toEqual({ success: true });
  });
});
