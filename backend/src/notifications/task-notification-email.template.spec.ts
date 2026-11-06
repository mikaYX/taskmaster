import { renderTaskNotificationEmail } from './task-notification-email.template';

describe('renderTaskNotificationEmail', () => {
  const data = {
    taskName: 'Backup <servers>',
    appTitle: 'Taskmaster',
    details: [
      { label: 'Tâche', value: 'Backup <servers>' },
      { label: 'Date', value: '2026-11-05' },
      { label: 'Motif', value: 'Disk <full>\nsecond line' },
      {
        label: 'Lien',
        value: 'https://taskmaster.example.com/task-definitions/1',
      },
    ],
  };

  it.each([
    ['FAILED', 'Une tâche a échoué', '#b91c1c'],
    ['OVERDUE', "Une tâche n'a pas été réalisée", '#b45309'],
    ['REMINDER', 'Une tâche arrive à échéance', '#1d4ed8'],
  ] as const)('gives %s its own title and colour', (event, title, color) => {
    const html = renderTaskNotificationEmail({ ...data, event });

    expect(html).toContain(title);
    expect(html).toContain(`background:${color}`);
  });

  it('escapes every user value', () => {
    const html = renderTaskNotificationEmail({ ...data, event: 'FAILED' });

    expect(html).not.toContain('<servers>');
    expect(html).toContain('Backup &lt;servers&gt;');
    expect(html).toContain('Disk &lt;full&gt;<br>second line');
  });

  it('turns the link into a button and keeps it readable in plain text', () => {
    const html = renderTaskNotificationEmail({ ...data, event: 'OVERDUE' });

    expect(html).toContain('Ouvrir la tâche');
    expect(html).toContain(
      '<a href="https://taskmaster.example.com/task-definitions/1">',
    );
  });

  it('has no button without a link', () => {
    const html = renderTaskNotificationEmail({
      ...data,
      event: 'OVERDUE',
      details: data.details.filter((line) => line.label !== 'Lien'),
    });

    expect(html).not.toContain('Ouvrir la tâche');
  });

  it('shows a logo when there is one', () => {
    const html = renderTaskNotificationEmail({
      ...data,
      event: 'REMINDER',
      logoUrl: 'https://cdn.example.com/logo.png',
    });

    expect(html).toContain('src="https://cdn.example.com/logo.png"');
  });
});
