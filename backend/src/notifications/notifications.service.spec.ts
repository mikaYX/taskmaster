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
      'Échec de tâche: Check <b>boiler</b> — 2026-10-20',
    );
    expect(mail.text).toContain('Date : 2026-10-20');
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
      'Tâche en retard (Manquante): Check <b>boiler</b>',
    );
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
