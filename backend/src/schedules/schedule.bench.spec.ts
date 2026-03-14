import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleService } from './schedule.service';
import { PrismaService } from '../prisma';
import { SettingsService } from '../settings/settings.service';

describe('createBulk — perf benchmark', () => {
  let service: ScheduleService;
  let counter = 100;

  const mockPrisma = {
    client: {
      task: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      schedule: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    },
    getDefaultSiteId: jest.fn().mockReturnValue(1),
  };

  const mockSettings = {
    getRawValue: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettings },
      ],
    }).compile();

    service = module.get<ScheduleService>(ScheduleService);
  });

  afterEach(() => jest.clearAllMocks());

  it('p95 < 200ms for 50-item bulk (20 iterations)', async () => {
    const iterations = 20;
    const batchSize = 50;
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const items = Array.from({ length: batchSize }, (_, j) => ({
        taskId: j + 1,
        recurrenceMode: 'ON_SCHEDULE',
        rrule: 'FREQ=DAILY',
        timezone: 'Europe/Paris',
        label: `bench-${i}-${j}`,
      }));

      const taskIds = items.map((it) => ({ id: it.taskId }));

      mockSettings.getRawValue
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      mockPrisma.client.task.findMany.mockResolvedValue(taskIds);

      const results = items.map((it, j) => ({
        id: counter++,
        taskId: it.taskId,
        recurrenceMode: it.recurrenceMode,
        rrule: it.rrule,
        timezone: it.timezone,
        openOffset: 0,
        closeOffset: null,
        dueOffset: null,
        status: 'ACTIVE',
        maxOccurrences: null,
        occurrenceCount: 0,
        endsAt: null,
        pausedAt: null,
        siteId: null,
        label: it.label,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      mockPrisma.client.$transaction.mockResolvedValue(results);

      const start = performance.now();
      await service.createBulk(items as any);
      durations.push(performance.now() - start);

      jest.clearAllMocks();
    }

    durations.sort((a, b) => a - b);
    const p50 = durations[Math.floor(iterations * 0.5)];
    const p95 = durations[Math.floor(iterations * 0.95)];
    const max = durations[iterations - 1];

    console.log(`Benchmark: ${iterations} iterations × ${batchSize} items`);
    console.log(`  p50: ${p50.toFixed(2)}ms`);
    console.log(`  p95: ${p95.toFixed(2)}ms`);
    console.log(`  max: ${max.toFixed(2)}ms`);

    expect(p95).toBeLessThan(200);
  });
});
