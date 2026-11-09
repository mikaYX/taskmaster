import { StatusService } from './status.service';
import type { PrismaService } from '../prisma';
import type { NotificationsService } from '../notifications/notifications.service';
import type { UpsertStatusDto } from './dto';

function fixture(previous: { status: string } | null) {
  const client = {
    task: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 3, executionChecklist: [] }),
    },
    status: {
      findUnique: jest.fn().mockResolvedValue(previous),
      upsert: jest.fn().mockImplementation(({ create }) =>
        Promise.resolve({
          id: 1,
          comment: null,
          updatedAt: new Date('2026-10-16T10:00:00Z'),
          updatedByUserId: 1,
          updatedByUsername: 'api',
          instanceDate: new Date(create.instanceDate),
          ...create,
        }),
      ),
    },
  };
  const notifications = { notifyTaskFailure: jest.fn() };
  const service = new StatusService(
    { client } as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { service, client, notifications };
}

const failed = {
  taskId: 3,
  instanceDate: '2026-10-16',
  status: 'FAILED',
  comment: 'Panel is dead',
} as UpsertStatusDto;

describe('StatusService.upsert failure notification', () => {
  it('reads the previous status of the occurrence before saving and hands both to the rule', async () => {
    const { service, client, notifications } = fixture({ status: 'RUNNING' });

    await service.upsert(failed, 1, 'api');

    expect(client.status.findUnique).toHaveBeenCalledWith({
      where: {
        taskId_instanceDate: {
          taskId: 3,
          instanceDate: new Date('2026-10-16'),
        },
      },
      select: { status: true },
    });
    expect(client.status.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      client.status.upsert.mock.invocationCallOrder[0],
    );
    expect(notifications.notifyTaskFailure).toHaveBeenCalledWith(
      3,
      { status: 'FAILED', previousStatus: 'RUNNING' },
      { instanceDate: '2026-10-16', comment: 'Panel is dead', actor: 'api' },
    );
  });

  it('tells the rule when the occurrence was already failed, so a repeated call stays silent', async () => {
    const { service, notifications } = fixture({ status: 'FAILED' });

    await service.upsert(failed, 1, 'api');

    expect(notifications.notifyTaskFailure).toHaveBeenCalledWith(
      3,
      { status: 'FAILED', previousStatus: 'FAILED' },
      expect.any(Object),
    );
  });

  it('reports a first status as having no previous one', async () => {
    const { service, notifications } = fixture(null);

    await service.upsert({ ...failed, status: 'SUCCESS' }, 1, 'api');

    expect(notifications.notifyTaskFailure).toHaveBeenCalledWith(
      3,
      { status: 'SUCCESS', previousStatus: undefined },
      expect.any(Object),
    );
  });
});
