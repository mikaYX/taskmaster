# User guide

Day-to-day use of Taskmaster: the task board, validating and reporting tasks, checklists, corrective actions, delegations, the Todo module and the analytics.

## Concepts

- A **task definition** describes recurring work: its name, procedure, schedule, time window, priority and the people or groups assigned to it.
- From each definition, Taskmaster generates **occurrences**: one per scheduled date. They are what you validate on the task board.
- An occurrence has one of four statuses:

| Status | Meaning |
| --- | --- |
| Running | To do, within its time window |
| Validated | Done |
| Failed | Done, with a problem reported |
| Missing | Not done before the end of its window. Taskmaster sets this status by itself. |

## Task board

The **Task Board** (`/tasks`) is the home page.

- **Header tiles**: overall progress, then the number of tasks in progress, urgent and completed. A task is *urgent* when its window ends within the hour.
- **Filters**: period (Today, 7d, 30d, 90d or a date range), text search, user and group. **Saved views** stores a set of filters under a name.
- **Compact layout** shows more rows on screen.
- **Completed** shows the occurrences already validated, failed or missing.

Each row shows:
- the periodicity, status and priority;
- the task name and description;
- the assignees and the time window;
- three actions: open the procedure, **validate** (✓) and **report a failure** (✕).

### Validate a task

Click the green check (✓) on the row. Without a checklist, the occurrence becomes **Validated** immediately. With a checklist, a dialog asks for the steps first. The action is recorded in the audit log and counted in the analytics.

### Report a failure

Click the red cross (✕), describe the problem (required) and confirm. The occurrence becomes **Failed**. Managers and administrators see the reason in the reports and the audit log.

### TV mode

**TV mode** shows the board full screen for a wall display. It refreshes by itself.

For a screen that stays signed in without a personal account, an administrator creates a guest link in **Settings → Security → Guest TV Links**. A guest is read-only and sees only its site.

## Checklists and evidence

A task definition can hold an **execution checklist** of up to 50 steps:
- step types: checkbox, text, measurement or photo;
- each step is required or optional;
- with an empty checklist, validation stays a single click.

When you validate, every required step must be completed. A measurement of zero is a valid answer. Photos must be PNG, JPEG or WebP, up to 5 MB: wait until a photo is saved before validating. Photos are never public. Downloading one requires access to the task and its site.

The **Execution report** of a finished occurrence shows the answers and the step labels as they were at execution time, even if the checklist changed since. If the server refuses a validation, the answers already typed stay in the dialog.

## Corrective actions

When you report a failure, the checklist can stay incomplete. Tick **Create a corrective action** to describe the work needed and, optionally, a due date:
- the action is assigned to you, but a manager can pick another active member of the same site;
- the failed check and the action are saved together;
- a retry does not create a second action for the same occurrence.

The **Corrective actions** page lists open and closed actions.
- **Who sees what**: you see the actions you own or created; managers see those of their sites.
- **Closing**: the owner or a manager closes an action by describing the resolution, and can reopen it. Closing keeps the original check as failed.
- **Search and filters**: search covers the action title, the task name and the owner. **My actions** keeps the actions you own. **Overdue only** keeps open actions whose due date is before today. Actions due today or without a due date are not overdue.
- **Sorting and pages**: results are sorted by due date, actions without one last, 50 per page.

## Delegations

A delegation hands a task to other users or groups for a period, for example during leave. They then see it on their board and can validate it.

1. Open **Task Definitions**, then the task.
2. Open **Delegations** and click **New Delegation**.
3. Set the start and end, the users and/or groups, and optionally a reason (for example *Annual leave*).
4. Click **Create Delegation**.

The same panel lists active and planned delegations. Removing one gives the task back to its usual assignees.

## Create a task

**Task Definitions → Add Task** opens a five-step wizard. Super admins and managers can create and edit tasks:

| Step | What you set |
| --- | --- |
| 1. Definition | Name, priority, procedure (link or file), description, periodicity (daily, weekly, monthly, yearly or custom) and an optional checklist |
| 2. Scheduling | Start date, skip weekends and holidays, interval, time zone, due offset, recurrence mode (on schedule, or from the last completion) and the time window |
| 3. Assignment | Users and/or groups |
| 4. Notifications | Channels, and when to alert: on failure, when missed, or as a reminder before the due time |
| 5. Review & Create | Summary and the next five occurrences |

Examples of schedules are in [Use cases](use-cases.md).

## Todo

**Todo** is a lightweight checklist, separate from the recurring tasks:
- a **Private** list, and a **Collective** list shared with a group or the whole site;
- due dates, priorities (low, normal, high, urgent), subtasks and recurrence;
- reminders by email or push notification, set under **Reminders**;
- **History** lists everything ticked in the private or collective list.

Quick add reads the date, time and priority from what you type:

```text
Call the supplier @tomorrow @14:30 !urgent
```

| Token | Examples |
| --- | --- |
| Priority | `!low` `!normal` `!high` `!urgent` |
| Day | `@today` `@tomorrow` `@monday` `@+3d` `@+2w` `@2026-11-02` `@02/11` |
| Time | `@14:30` `@9h` |

Anything else stays in the title. The French words (`@demain`, `!haute`…) work too. An administrator can turn the module off in Settings → General.

## Analytics

**Analytics** (`/analytics`):
- **Overview**: compliance rate against the goal, success, failure and missing counts, a status trend by day or week, and the tasks below the goal under **Needs attention**;
- **By task**: ranking of the tasks over the selected period;
- **By user** (managers and super admins): ranking of the users;
- **Reports** (managers and super admins): export to CSV or PDF;
- **TV mode**: a full-screen layout for a 1080p wall screen, refreshed every 30 seconds.

## Profile

Open the account menu, then **Profile**, to:
- change your display name and password;
- set up MFA and passkeys.

Todo reminder preferences are under **Todo → Reminders**.

Your role and email address are managed by an administrator. The MFA recovery codes are shown only once, when you enable MFA: keep them before closing the dialog.

## Who sees what

| Page | Super Admin | Manager | User | Guest |
| --- | --- | --- | --- | --- |
| Task Board, Todo, Corrective actions | ✓ | ✓ | ✓ | Board only |
| Analytics | ✓ | ✓ | Without By user and exports | Through an analytics guest link |
| Task Definitions | ✓ | ✓ | Read only | |
| Settings | ✓ | Users only | | |
| Audit Log | ✓ | | | |

Opening a page your role does not allow shows an "access denied" message. The server enforces the same rules.
