import { Test, TestingModule } from '@nestjs/testing';
import { DelegationsController } from './delegations.controller';
import { DelegationsService } from './delegations.service';
import { CreateDelegationDto } from './dto/create-delegation.dto';
import { UpdateDelegationDto } from './dto/update-delegation.dto';
import { ConflictException } from '@nestjs/common';

describe('DelegationsController', () => {
  let controller: DelegationsController;
  let service: DelegationsService;

  const mockDelegationsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DelegationsController],
      providers: [
        { provide: DelegationsService, useValue: mockDelegationsService },
      ],
    }).compile();

    controller = module.get<DelegationsController>(DelegationsController);
    service = module.get<DelegationsService>(DelegationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call DelegationsService.create and return result', async () => {
      const dto: CreateDelegationDto = {
        startAt: '2026-03-01T08:00:00Z',
        endAt: '2026-03-15T18:00:00Z',
        targetUserIds: [2],
      };
      const expectedResult = { id: 1, ...dto };
      mockDelegationsService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(10, dto, 1);
      expect(service.create).toHaveBeenCalledWith(10, dto, 1);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findAll', () => {
    it('should call DelegationsService.findAll and return result', async () => {
      const expectedResult = [{ id: 1 }];
      mockDelegationsService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(10);
      expect(service.findAll).toHaveBeenCalledWith(10);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('update', () => {
    it('should call DelegationsService.update and return result', async () => {
      const dto: UpdateDelegationDto = { reason: 'Updated reason' };
      const expectedResult = { id: 5, reason: 'Updated reason' };
      mockDelegationsService.update.mockResolvedValue(expectedResult);

      const result = await controller.update(10, 5, dto, 1);
      expect(service.update).toHaveBeenCalledWith(10, 5, dto, 1);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('remove', () => {
    it('should call DelegationsService.remove and return result', async () => {
      const expectedResult = { id: 5 };
      mockDelegationsService.remove.mockResolvedValue(expectedResult);

      const result = await controller.remove(10, 5, 1, 'admin');
      expect(service.remove).toHaveBeenCalledWith(10, 5, 1, 'admin');
      expect(result).toEqual(expectedResult);
    });
  });
});
