/**
 * Tests de validation — Point 92 : Soft-delete cohérent sur Group
 *
 * Ces tests vérifient que :
 * - remove() effectue un soft-delete (update deletedAt) plutôt qu'un DELETE physique
 * - findAll() exclut les groupes soft-deleted (deletedAt IS NOT NULL)
 * - findOne() retourne 404 pour un groupe soft-deleted
 * - create() autorise la recréation d'un nom précédemment soft-deleted
 * - Les groupes système ne peuvent pas être supprimés
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { PrismaService } from '../prisma';

const mockPrismaClient = {
  group: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  userGroupMembership: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockPrismaService = {
  client: mockPrismaClient,
  buildSiteFilter: jest.fn().mockReturnValue({}),
  getCurrentUser: jest.fn().mockReturnValue(null),
  getUserSiteIds: jest.fn().mockReturnValue([1]),
  getDefaultSiteId: jest.fn().mockReturnValue(1),
};

const makeGroup = (overrides = {}) => ({
  id: 1,
  name: 'Test Group',
  isSystem: false,
  description: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
  siteId: 1,
  site: { id: 1, name: 'HQ', code: 'HQ' },
  _count: { members: 0 },
  members: [],
  ...overrides,
});

describe('Point 92 — GroupsService soft-delete', () => {
  let service: GroupsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<GroupsService>(GroupsService);
    jest.clearAllMocks();
    mockPrismaService.buildSiteFilter.mockReturnValue({});
  });

  // ─── remove() ────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('doit effectuer un soft-delete (update deletedAt) et NON un delete physique', async () => {
      mockPrismaClient.group.findFirst.mockResolvedValue(makeGroup());
      mockPrismaClient.group.update.mockResolvedValue(
        makeGroup({ deletedAt: new Date() }),
      );

      await service.remove(1);

      // delete() NE doit jamais être appelé
      expect(mockPrismaClient.group.delete).not.toHaveBeenCalled();

      // update() DOIT être appelé avec deletedAt
      expect(mockPrismaClient.group.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('doit lever NotFoundException pour un groupe déjà soft-deleted', async () => {
      // findFirst retourne null car la query filtre deletedAt: null
      mockPrismaClient.group.findFirst.mockResolvedValue(null);

      await expect(service.remove(1)).rejects.toThrow(NotFoundException);
    });

    it('doit lever NotFoundException pour un groupe inexistant', async () => {
      mockPrismaClient.group.findFirst.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });

    it('doit lever ConflictException pour un groupe système', async () => {
      mockPrismaClient.group.findFirst.mockResolvedValue(
        makeGroup({ isSystem: true }),
      );

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
      expect(mockPrismaClient.group.update).not.toHaveBeenCalled();
      expect(mockPrismaClient.group.delete).not.toHaveBeenCalled();
    });
  });

  // ─── findAll() ───────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('doit filtrer les groupes soft-deleted (deletedAt: null dans la query)', async () => {
      mockPrismaClient.group.findMany.mockResolvedValue([makeGroup()]);

      await service.findAll();

      expect(mockPrismaClient.group.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    it('ne doit pas retourner les groupes soft-deleted', async () => {
      mockPrismaClient.group.findMany.mockResolvedValue([makeGroup()]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });
  });

  // ─── findOne() ───────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('doit retourner le groupe si deletedAt est null', async () => {
      mockPrismaClient.group.findFirst.mockResolvedValue(makeGroup());

      const result = await service.findOne(1);

      expect(result.id).toBe(1);
      expect(mockPrismaClient.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 1, deletedAt: null }),
        }),
      );
    });

    it('doit lever NotFoundException si le groupe est soft-deleted', async () => {
      // findFirst retourne null car deletedAt IS NOT NULL → filtré par la query
      mockPrismaClient.group.findFirst.mockResolvedValue(null);

      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create() ────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('doit autoriser la création d\'un groupe avec le nom d\'un groupe soft-deleted', async () => {
      // findFirst retourne null car le groupe portant ce nom est soft-deleted
      mockPrismaClient.group.findFirst.mockResolvedValue(null);
      mockPrismaClient.client?.site?.findUnique?.mockResolvedValue(null);

      const newGroup = makeGroup({ id: 2, name: 'Recycled Group' });
      mockPrismaClient.group.create.mockResolvedValue(newGroup);

      // site check
      mockPrismaService.getDefaultSiteId.mockReturnValue(1);

      const result = await service.create({ name: 'Recycled Group' });

      expect(result.name).toBe('Recycled Group');
      expect(mockPrismaClient.group.create).toHaveBeenCalled();
    });
  });

  // ─── count() ─────────────────────────────────────────────────────────────

  describe('count()', () => {
    it('doit exclure les groupes soft-deleted du comptage', async () => {
      mockPrismaClient.group.count.mockResolvedValue(3);

      await service.count();

      // Les deux appels count() doivent inclure deletedAt: null
      expect(mockPrismaClient.group.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });
  });
});
