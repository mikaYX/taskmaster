import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { InstanceService } from './instance.service';
import { AuditService } from '../audit/audit.service';
import { ProcedureStorageService } from './procedure-storage.service';
import { BeneficiaryResolverService } from '../modules/delegations/beneficiary-resolver.service';
import { formatInTimeZone } from 'date-fns-tz';

describe('TasksService Timezone Drift (Non-Regression)', () => {
    let service: TasksService;
    let mockPrismaService: any;
    let mockInstanceService: any;

    beforeEach(async () => {
        mockPrismaService = {
            buildSiteFilter: jest.fn().mockReturnValue({}),
            client: {
                task: {
                    findMany: jest.fn(),
                },
                status: {
                    findMany: jest.fn(),
                    findFirst: jest.fn(),
                    count: jest.fn(),
                },
            },
        };

        mockInstanceService = {
            computeInstances: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TasksService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: ConfigService, useValue: { get: jest.fn() } },
                { provide: SettingsService, useValue: { getRawValue: jest.fn().mockReturnValue(null) } },
                { provide: InstanceService, useValue: mockInstanceService },
                { provide: AuditService, useValue: {} },
                { provide: ProcedureStorageService, useValue: {} },
                { provide: BeneficiaryResolverService, useValue: {} },
            ],
        }).compile();

        service = module.get<TasksService>(TasksService);
    });

    it('should format instanceDate correctly for Europe/Paris (UTC+1) - 4 Mars 2026 case', async () => {
        // 1. Setup a date that is March 4th 00:00 in Paris, which is March 3rd 23:00 UTC
        const parisTimezone = 'Europe/Paris';
        const dateStr = '2026-03-04T00:00:00';
        // Create actual Date object (which will be treated as UTC by Node if no Z and we use Date.UTC or similar, 
        // but here we want the exact timestamp)
        const dateAtMidnightParis = new Date('2026-03-03T23:00:00Z');

        // Verify our assumption: in Paris timezone, this date IS March 4th
        expect(formatInTimeZone(dateAtMidnightParis, parisTimezone, 'yyyy-MM-dd')).toBe('2026-03-04');
        // Verify it would FAIL with toISOString().split('T')[0]
        expect(dateAtMidnightParis.toISOString().split('T')[0]).toBe('2026-03-03');

        const mockTask = {
            id: 1,
            name: 'Daily Paris',
            timezone: parisTimezone,
            periodicity: 'daily',
            startDate: new Date('2026-03-01T00:00:00Z'),
            userAssignments: [],
            groupAssignments: [],
            overrides: [],
        };

        mockPrismaService.client.task.findMany.mockResolvedValue([mockTask]);
        mockPrismaService.client.status.findMany.mockResolvedValue([]);

        mockInstanceService.computeInstances.mockReturnValue([{
            taskId: 1,
            date: dateAtMidnightParis,
            originalDate: dateAtMidnightParis,
            periodicity: 'daily',
            periodStart: dateAtMidnightParis,
            periodEnd: new Date(dateAtMidnightParis.getTime() + 3600000),
        }]);

        // 2. Call getBoardItems
        const result = await service.getBoardItems(
            new Date('2026-03-01T00:00:00Z'),
            new Date('2026-03-10T00:00:00Z'),
            1, [], true
        );

        // 3. Verify instanceDate reflects Paris day, not UTC day
        expect(result.items).toHaveLength(1);
        expect(result.items[0].instanceDate).toBe('2026-03-04');
        expect(result.items[0].instanceDate).not.toBe('2026-03-03');
    });

    it('should work correctly for UTC cases', async () => {
        const timezone = 'UTC';
        const dateAtMidnightUTC = new Date('2026-03-04T00:00:00Z');

        const mockTask = {
            id: 2,
            name: 'Daily UTC',
            timezone: timezone,
            periodicity: 'daily',
            startDate: new Date('2026-03-01T00:00:00Z'),
            userAssignments: [],
            groupAssignments: [],
            overrides: [],
        };

        mockPrismaService.client.task.findMany.mockResolvedValue([mockTask]);
        mockPrismaService.client.status.findMany.mockResolvedValue([]);

        mockInstanceService.computeInstances.mockReturnValue([{
            taskId: 2,
            date: dateAtMidnightUTC,
            originalDate: dateAtMidnightUTC,
            periodicity: 'daily',
            periodStart: dateAtMidnightUTC,
            periodEnd: new Date(dateAtMidnightUTC.getTime() + 3600000),
        }]);

        const result = await service.getBoardItems(
            new Date('2026-03-01T00:00:00Z'),
            new Date('2026-03-10T00:00:00Z'),
            1, [], true
        );

        expect(result.items[0].instanceDate).toBe('2026-03-04');
    });

    it('should match status keys correctly even with timezone offset', async () => {
        const tz = 'Europe/Paris';
        const date = new Date('2026-03-03T23:00:00Z'); // March 4th in Paris

        const mockTask = { id: 10, timezone: tz, periodicity: 'daily', userAssignments: [], groupAssignments: [], overrides: [] };
        mockPrismaService.client.task.findMany.mockResolvedValue([mockTask]);

        // Mock status in DB
        // Status in DB has instanceDate which is a Date at midnight UTC for that day
        mockPrismaService.client.status.findMany.mockResolvedValue([{
            taskId: 10,
            instanceDate: new Date('2026-03-04T00:00:00Z'), // Recorded as March 4th
            status: 'SUCCESS',
            updatedAt: new Date(),
            updatedBy: { username: 'tester' }
        }]);

        mockInstanceService.computeInstances.mockReturnValue([{
            taskId: 10,
            date: date,
            originalDate: date,
        }]);

        const result = await service.getBoardItems(
            new Date('2026-03-01T00:00:00Z'),
            new Date('2026-03-10T00:00:00Z'),
            1, [], true
        );

        expect(result.items[0].instanceDate).toBe('2026-03-04');
        expect(result.items[0].status).toBe('SUCCESS'); // MUST match!
    });
});
