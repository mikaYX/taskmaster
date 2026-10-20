import { UserNotificationsService } from './user-notifications.service';

function build() {
  const model = {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([{ id: 2 }, { id: 1 }]),
    count: jest.fn().mockResolvedValue(1),
    updateMany: jest.fn().mockResolvedValue({ count: 3 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 4 }),
  };
  const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const service = new UserNotificationsService(
    { client: { userNotification: model } } as never,
    push as never,
  );
  return { service, model, push };
}

describe('UserNotificationsService', () => {
  it('stores the notification and pops it up when asked', async () => {
    const { service, model, push } = build();

    await service.notify(
      8,
      {
        type: 'todo.assigned',
        title: 'Tâche assignée',
        body: 'x',
        url: '/todos',
      },
      { push: true },
    );

    expect(model.create.mock.calls[0][0].data).toEqual({
      userId: 8,
      type: 'todo.assigned',
      title: 'Tâche assignée',
      body: 'x',
      url: '/todos',
    });
    expect(push.sendToUser).toHaveBeenCalledWith(8, {
      title: 'Tâche assignée',
      body: 'x',
      url: '/todos',
      tag: 'todo.assigned',
    });
  });

  it('keeps the bell alone when no pop-up is wanted', async () => {
    const { service, push } = build();

    await service.notify(8, { type: 't', title: 'T' });

    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('never throws: a notification must not break what caused it', async () => {
    const { service, model } = build();
    model.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.notify(8, { type: 't', title: 'T' }),
    ).resolves.toBeUndefined();
  });

  it('lists the latest ones with the unread count', async () => {
    const { service, model } = build();

    const result = await service.list(8);

    expect(result).toEqual({ unread: 1, items: [{ id: 2 }, { id: 1 }] });
    expect(model.findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 8 },
      take: 30,
    });
    expect(model.count).toHaveBeenCalledWith({
      where: { userId: 8, readAt: null },
    });
  });

  it('only marks the notifications of that person as read', async () => {
    const { service, model } = build();

    await service.markRead(8, 5);
    await service.markAllRead(8);

    expect(model.updateMany.mock.calls[0][0].where).toEqual({
      id: 5,
      userId: 8,
      readAt: null,
    });
    expect(model.updateMany.mock.calls[1][0].where).toEqual({
      userId: 8,
      readAt: null,
    });
  });

  it('clears read ones after a month and anything after three', async () => {
    const { service, model } = build();
    const now = new Date('2026-10-20T00:00:00Z');

    expect(await service.purgeOld(now)).toBe(4);

    const [readOnes, anyOnes] = model.deleteMany.mock.calls[0][0].where.OR;
    expect(readOnes.createdAt.lt).toEqual(new Date('2026-09-20T00:00:00Z'));
    expect(anyOnes.createdAt.lt).toEqual(new Date('2026-07-22T00:00:00Z'));
  });
});
