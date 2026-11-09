import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../settings/encryption.service';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import { PushService } from './push.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: {} },
        { provide: EncryptionService, useValue: {} },
        { provide: EmailService, useValue: {} },
        {
          provide: SettingsService,
          useValue: { getRawValue: jest.fn() },
        },
        {
          provide: PushService,
          useValue: { sendViaChannelConfig: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

describe('NotificationsService.dispatchTaskNotifications (email)', () => {
  const task = {
    name: 'Check <b>boiler</b>',
    description: 'Look at the pressure',
    priority: 'HIGH',
  };
  const emailChannel = { id: 1, type: 'EMAIL', enabled: true, config: '' };
  const prisma = {
    client: {
      task: { findUnique: jest.fn() },
      taskNotification: { findMany: jest.fn() },
      user: { findMany: jest.fn() },
      group: { findMany: jest.fn() },
      status: { findUnique: jest.fn() },
      correctiveAction: { findUnique: jest.fn() },
    },
  };
  const email = { send: jest.fn() };
  const service = new NotificationsService(
    prisma as never,
    { decrypt: jest.fn() } as never,
    email as never,
    { getRawValue: jest.fn() } as never,
    { sendViaChannelConfig: jest.fn() } as never,
  );
  const context = {
    instanceDate: '2026-10-20',
    comment: 'Pressure too low\nsecond line',
    actor: 'Olivia Operator',
    correctiveAction: 'Call the technician',
  };
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.FRONTEND_URL = 'https://taskmaster.example.com/';
    prisma.client.task.findUnique.mockResolvedValue(task);
    prisma.client.status.findUnique.mockResolvedValue(null);
    prisma.client.correctiveAction.findUnique.mockResolvedValue(null);
    email.send.mockResolvedValue(true);
  });

  afterEach(() => {
    delete process.env.FRONTEND_URL;
  });

  it('writes a mail a helpdesk can turn into a ticket', async () => {
    prisma.client.taskNotification.findMany.mockResolvedValue([
      {
        taskId: 7,
        channelId: 1,
        channel: emailChannel,
        notifyOnFailed: true,
        notifyOnMissing: false,
        notifyOnReminder: false,
        emailCustom: ['glpi@example.com'],
      },
    ]);

    await service.dispatchTaskNotifications(7, 'FAILED', context);
    await flush();

    expect(email.send).toHaveBeenCalledTimes(1);
    const mail = email.send.mock.calls[0][0];
    expect(mail.to).toEqual(['glpi@example.com']);
    expect(mail.subject).toBe(
      'Échec de tâche : Check <b>boiler</b> — 20/10/2026',
    );
    expect(mail.text).toContain('Date : 20/10/2026');
    expect(mail.text).toContain('Priorité : Haute');
    expect(mail.text).toContain('Signalé par : Olivia Operator');
    expect(mail.text).toContain('Motif : Pressure too low\nsecond line');
    expect(mail.text).toContain('Action corrective : Call the technician');
    expect(mail.text).toContain(
      'Lien : https://taskmaster.example.com/task-definitions/7',
    );
    // User input never reaches the HTML unescaped.
    expect(mail.html).not.toContain('<b>boiler</b>');
    expect(mail.html).toContain('Check &lt;b&gt;boiler&lt;/b&gt;');
    expect(mail.html).toContain('Pressure too low<br>second line');
    expect(mail.html).toContain(
      '<a href="https://taskmaster.example.com/task-definitions/7">',
    );
  });

  it('only uses the targeted row and states the deadline in the task time zone', async () => {
    prisma.client.task.findUnique.mockResolvedValue({
      ...task,
      timezone: 'Europe/Paris',
    });
    prisma.client.taskNotification.findMany.mockResolvedValue([
      {
        id: 1,
        taskId: 7,
        channelId: 1,
        channel: emailChannel,
        notifyOnReminder: true,
        emailCustom: ['one@example.com'],
      },
      {
        id: 2,
        taskId: 7,
        channelId: 2,
        channel: { ...emailChannel, id: 2 },
        notifyOnReminder: true,
        emailCustom: ['two@example.com'],
      },
    ]);

    await service.dispatchTaskNotifications(7, 'REMINDER', {
      notificationId: 2,
      instanceDate: '2026-11-05',
      deadline: new Date('2026-11-05T17:00:00.000Z'),
    });
    await flush();

    expect(email.send).toHaveBeenCalledTimes(1);
    const mail = email.send.mock.calls[0][0];
    expect(mail.to).toEqual(['two@example.com']);
    expect(mail.text).toContain('Échéance : 05/11/2026 18:00');
    expect(mail.html).toContain('Une tâche arrive à échéance');
  });

  it('sends each configured channel to its own recipients', async () => {
    prisma.client.taskNotification.findMany.mockResolvedValue([
      {
        taskId: 7,
        channelId: 1,
        channel: { ...emailChannel, id: 1 },
        notifyOnFailed: true,
        notifyOnMissing: false,
        notifyOnReminder: false,
        emailCustom: ['glpi@example.com'],
      },
      {
        taskId: 7,
        channelId: 2,
        channel: { ...emailChannel, id: 2 },
        notifyOnFailed: true,
        notifyOnMissing: true,
        notifyOnReminder: false,
        emailCustom: ['team@example.com'],
      },
    ]);

    await service.dispatchTaskNotifications(7, 'FAILED', context);
    await flush();

    expect(email.send.mock.calls.map(([mail]) => mail.to)).toEqual([
      ['glpi@example.com'],
      ['team@example.com'],
    ]);
  });

  it('only reaches the channels that asked for that event', async () => {
    prisma.client.taskNotification.findMany.mockResolvedValue([
      {
        taskId: 7,
        channelId: 1,
        channel: emailChannel,
        notifyOnFailed: true,
        notifyOnMissing: false,
        notifyOnReminder: false,
        emailCustom: ['failures@example.com'],
      },
      {
        taskId: 7,
        channelId: 2,
        channel: { ...emailChannel, id: 2 },
        notifyOnFailed: false,
        notifyOnMissing: true,
        notifyOnReminder: false,
        emailCustom: ['missed@example.com'],
      },
    ]);

    await service.dispatchTaskNotifications(7, 'OVERDUE');
    await flush();

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0][0].to).toEqual(['missed@example.com']);
    // No occurrence date to add for a job-driven event: the subject stays plain.
    expect(email.send.mock.calls[0][0].subject).toBe(
      'Tâche non réalisée : Check <b>boiler</b>',
    );
  });

  const checklist = [
    { id: 'valve', label: 'Close the valve', kind: 'CHECK', required: true },
    { id: 'reading', label: 'Pressure (bar)', kind: 'NUMBER', required: true },
    { id: 'note', label: 'Remarks <i>', kind: 'TEXT', required: false },
    { id: 'shot', label: 'Gauge photo', kind: 'PHOTO', required: false },
  ];
  const failedRow = [
    {
      taskId: 7,
      channelId: 1,
      channel: emailChannel,
      notifyOnFailed: true,
      notifyOnMissing: true,
      notifyOnReminder: true,
      emailCustom: ['glpi@example.com'],
    },
  ];

  it('lists the checklist steps with their answers, without the photos', async () => {
    prisma.client.task.findUnique.mockResolvedValue({
      ...task,
      procedureUrl: 'https://wiki.example.com/boiler',
      executionChecklist: checklist,
    });
    prisma.client.status.findUnique.mockResolvedValue({
      executionRecord: [
        { id: 'valve', value: true },
        { id: 'note', value: 'Leak <here>' },
      ],
    });
    prisma.client.taskNotification.findMany.mockResolvedValue(failedRow);

    await service.dispatchTaskNotifications(7, 'FAILED', context);
    await flush();

    const mail = email.send.mock.calls[0][0];
    expect(mail.text).toContain(
      'Étapes : ✔ Close the valve\n○ Pressure (bar) : non renseignée (obligatoire)\n✔ Remarks <i> : Leak <here>',
    );
    expect(mail.text).not.toContain('Gauge photo');
    expect(mail.text).toContain('Procédure : https://wiki.example.com/boiler');
    expect(mail.html).toContain('✔ Remarks &lt;i&gt; : Leak &lt;here&gt;');
    expect(mail.html).not.toContain('Leak <here>');
  });

  it('shows what was ticked off when a step is explicitly unchecked', async () => {
    prisma.client.task.findUnique.mockResolvedValue({
      ...task,
      executionChecklist: [checklist[0]],
    });
    prisma.client.status.findUnique.mockResolvedValue({
      executionRecord: [{ id: 'valve', value: false }],
    });
    prisma.client.taskNotification.findMany.mockResolvedValue(failedRow);

    await service.dispatchTaskNotifications(7, 'FAILED', context);
    await flush();

    expect(email.send.mock.calls[0][0].text).toContain(
      'Étapes : ✘ Close the valve',
    );
  });

  it('only lists what had to be done when a missed task has no answers', async () => {
    prisma.client.task.findUnique.mockResolvedValue({
      ...task,
      executionChecklist: checklist,
    });
    prisma.client.taskNotification.findMany.mockResolvedValue(failedRow);

    await service.dispatchTaskNotifications(7, 'OVERDUE', {
      instanceDate: '2026-10-20',
    });
    await flush();

    expect(email.send.mock.calls[0][0].text).toContain(
      'Étapes : • Close the valve (obligatoire)\n• Pressure (bar) (obligatoire)\n• Remarks <i>',
    );
    expect(prisma.client.correctiveAction.findUnique).not.toHaveBeenCalled();
  });

  it('adds the assignee and the due date of the corrective action', async () => {
    prisma.client.correctiveAction.findUnique.mockResolvedValue({
      title: 'Call the technician',
      dueDate: new Date('2026-10-25T00:00:00.000Z'),
      assignee: { username: 'tech', fullname: 'Tom Technician' },
      assigneeGroup: null,
    });
    prisma.client.taskNotification.findMany.mockResolvedValue(failedRow);

    await service.dispatchTaskNotifications(7, 'FAILED', context);
    await flush();

    expect(email.send.mock.calls[0][0].text).toContain(
      'Action corrective : Call the technician\nAssignée à : Tom Technician\nAvant le : 25/10/2026',
    );
  });

  it('leaves the steps out of a reminder and of a task without checklist', async () => {
    prisma.client.task.findUnique.mockResolvedValue({
      ...task,
      executionChecklist: checklist,
    });
    prisma.client.taskNotification.findMany.mockResolvedValue(failedRow);

    await service.dispatchTaskNotifications(7, 'REMINDER', context);
    await flush();
    expect(email.send.mock.calls[0][0].text).not.toContain('Étapes');
    expect(prisma.client.status.findUnique).not.toHaveBeenCalled();

    email.send.mockClear();
    prisma.client.task.findUnique.mockResolvedValue({
      ...task,
      executionChecklist: [],
    });
    await service.dispatchTaskNotifications(7, 'FAILED', context);
    await flush();
    expect(email.send.mock.calls[0][0].text).not.toContain('Étapes');
  });

  it('still notifies when the answers cannot be read', async () => {
    prisma.client.task.findUnique.mockResolvedValue({
      ...task,
      executionChecklist: checklist,
    });
    prisma.client.status.findUnique.mockRejectedValue(new Error('db down'));
    prisma.client.taskNotification.findMany.mockResolvedValue(failedRow);

    await service.dispatchTaskNotifications(7, 'FAILED', context);
    await flush();

    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it('skips a disabled channel', async () => {
    prisma.client.taskNotification.findMany.mockResolvedValue([
      {
        taskId: 7,
        channelId: 1,
        channel: { ...emailChannel, enabled: false },
        notifyOnFailed: true,
        notifyOnMissing: true,
        notifyOnReminder: false,
        emailCustom: ['glpi@example.com'],
      },
    ]);

    await service.dispatchTaskNotifications(7, 'FAILED', context);
    await flush();

    expect(email.send).not.toHaveBeenCalled();
  });
});

describe('NotificationsService todolist channels', () => {
  const build = (linked: number[]) => {
    const prisma = {
      client: {
        notificationChannel: {
          findUnique: jest.fn().mockResolvedValue({ id: 5 }),
          delete: jest.fn().mockResolvedValue(undefined),
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    };
    const settings = {
      getRawValue: jest.fn().mockResolvedValue(linked),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const service = new NotificationsService(
      prisma as never,
      { decrypt: jest.fn() } as never,
      { send: jest.fn() } as never,
      settings as never,
      { sendViaChannelConfig: jest.fn() } as never,
    );
    return { service, prisma, settings };
  };

  it('unlinks a deleted channel from the todolist', async () => {
    const { service, settings } = build([2, 5]);

    await service.deleteChannel(5);

    expect(settings.set).toHaveBeenCalledWith(
      'addons.todolist.notify.channelIds',
      [2],
    );
  });

  it('leaves the todolist alone when the deleted channel was not linked', async () => {
    const { service, settings } = build([2]);

    await service.deleteChannel(5);

    expect(settings.set).not.toHaveBeenCalled();
  });

  it('reports how many tasks use each channel', async () => {
    const { service, prisma } = build([]);
    prisma.client.notificationChannel.findMany.mockResolvedValue([
      {
        id: 5,
        type: 'SLACK',
        name: 'Ops',
        config: '',
        enabled: true,
        _count: { taskNotifications: 4 },
      },
    ]);

    const [channel] = await service.getChannels();

    expect(channel.taskCount).toBe(4);
  });

  it('only broadcasts on enabled team channels', async () => {
    const { service, prisma } = build([]);

    await service.broadcast([1, 2], 'Nouvelle tâche collective', []);

    expect(prisma.client.notificationChannel.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [1, 2] },
        enabled: true,
        type: { notIn: ['EMAIL', 'PUSH'] },
      },
    });
  });
});

describe('NotificationsService.saveTaskNotifications', () => {
  const tx = {
    taskNotification: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const prisma = {
    isSuperAdmin: () => true,
    client: {
      task: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    },
  };
  const service = new NotificationsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.client.task.findUnique.mockResolvedValue({ id: 7 });
    prisma.client.$transaction.mockImplementation(
      (run: (client: typeof tx) => unknown) => run(tx),
    );
    tx.taskNotification.findMany.mockResolvedValue([]);
  });

  it.each([0, 10, 1455, 22.5])(
    'rejects a reminder delay of %s',
    async (offset) => {
      await expect(
        service.saveTaskNotifications(7, {
          notifications: [{ channelId: 1, reminderOffsetMinutes: offset }],
        }),
      ).rejects.toThrow('reminderOffsetMinutes');
      expect(prisma.client.$transaction).not.toHaveBeenCalled();
    },
  );

  it('keeps a valid delay and defaults to one hour', async () => {
    await service.saveTaskNotifications(7, {
      notifications: [
        { channelId: 1, reminderOffsetMinutes: 90 },
        { channelId: 2 },
      ],
    });

    const { data } = tx.taskNotification.createMany.mock.calls[0][0];
    expect(data[0].reminderOffsetMinutes).toBe(90);
    expect(data[1].reminderOffsetMinutes).toBe(60);
  });
});

describe('NotificationsService task site authorization', () => {
  const prisma = {
    isSuperAdmin: jest.fn(),
    getUserSiteIds: jest.fn(),
    client: {
      task: { findUnique: jest.fn() },
      taskNotification: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockResolvedValue([]),
    },
  };
  const service = new NotificationsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.client.taskNotification.findMany.mockResolvedValue([]);
    prisma.client.$transaction.mockResolvedValue([]);
    prisma.isSuperAdmin.mockReturnValue(false);
    prisma.getUserSiteIds.mockReturnValue([1]);
    prisma.client.task.findUnique.mockResolvedValue({ id: 7, siteId: 2 });
  });
  const operations = [
    () => service.getTaskNotifications(7),
    () => service.saveTaskNotifications(7, { notifications: [] }),
  ];
  it.each(operations)('rejects foreign-site access with 403', async (run) => {
    await expect(run()).rejects.toMatchObject({ status: 403 });
    expect(prisma.client.taskNotification.findMany).not.toHaveBeenCalled();
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });
  it.each(operations)('rejects a manager with no sites', async (run) => {
    prisma.getUserSiteIds.mockReturnValue([]);
    await expect(run()).rejects.toMatchObject({ status: 403 });
  });
  it.each(operations)('allows an assigned site', async (run) => {
    prisma.getUserSiteIds.mockReturnValue([2]);
    await expect(run()).resolves.toEqual([]);
  });
  it.each(operations)('allows super administrators', async (run) => {
    prisma.isSuperAdmin.mockReturnValue(true);
    await expect(run()).resolves.toEqual([]);
  });
});

describe('NotificationsService channel secret responses', () => {
  const secret = {
    botToken: 'telegram-secret',
    webhookUrl: 'https://secret.example/token',
    headers: { Authorization: 'Bearer secret' },
  };
  const channel = {
    id: 1,
    type: 'TELEGRAM',
    name: 'Team',
    config: 'encrypted',
  };
  const repository = Object.fromEntries(
    ['findUnique', 'create', 'update'].map((method) => [
      method,
      jest.fn().mockResolvedValue(channel),
    ]),
  );
  repository.findMany = jest.fn().mockResolvedValue([channel]);
  const service = new NotificationsService(
    { client: { notificationChannel: repository } } as never,
    {
      decrypt: () => JSON.stringify(secret),
      encrypt: () => 'encrypted',
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  beforeEach(() => {
    for (const method of ['findUnique', 'create', 'update'])
      repository[method].mockResolvedValue(channel);
    repository.findMany.mockResolvedValue([channel]);
  });
  it.each([
    () => service.getChannels(),
    () => service.getChannelById(1),
    () =>
      service.createChannel({ name: 'Team', type: 'TELEGRAM', config: secret }),
    () => service.updateChannel(1, { name: 'New name' }),
  ])('never returns configuration secrets', async (run) => {
    const result = await run();
    const dto = Array.isArray(result) ? result[0] : result;
    expect(dto.config).toEqual({
      botToken: true,
      webhookUrl: true,
      headers: true,
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});

describe('NotificationsService.updateChannel configuration round trip', () => {
  const stored = {
    botToken: 'real-token',
    chatId: '42',
    webhookUrl: 'https://hook.example/real',
  };
  const existing = { id: 1, type: 'TELEGRAM', name: 'Team', config: 'enc' };
  const update = jest.fn();
  const findUnique = jest.fn();
  const service = new NotificationsService(
    { client: { notificationChannel: { findUnique, update } } } as never,
    {
      decrypt: () => JSON.stringify(stored),
      encrypt: (value: string) => value,
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  beforeEach(() => {
    findUnique.mockResolvedValue(existing);
    update.mockReset();
    update.mockResolvedValue(existing);
  });
  const savedConfig = () =>
    JSON.parse(update.mock.calls[0][0].data.config as string);

  it('keeps stored secrets when the client sends back the presence flags', async () => {
    const read = await service.getChannelById(1);
    await service.updateChannel(1, { name: 'Renamed', config: read.config });
    expect(savedConfig()).toEqual(stored);
  });

  it('replaces a value that is explicitly changed and keeps the others', async () => {
    await service.updateChannel(1, {
      config: { botToken: 'new-token', chatId: true },
    });
    expect(savedConfig()).toEqual({ ...stored, botToken: 'new-token' });
  });
});
