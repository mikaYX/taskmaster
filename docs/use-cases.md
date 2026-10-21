# Use cases and scheduling examples

Typical task definitions, to copy or adapt. The **Rule** column is the recurrence rule (RRULE) Taskmaster stores. In the task wizard you build it with the periodicity cards and the **Custom** option.

| Use case | Periodicity | Rule | Options | Priority |
| --- | --- | --- | --- | --- |
| Daily safety walkthrough, working days | Daily | `FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR` | Skip weekends and holidays | High |
| Morning operations briefing, 7 days a week | Daily | `FREQ=DAILY` | | Medium |
| Weekly quality audit, every Monday | Weekly | `FREQ=WEEKLY;BYDAY=MO` | Time window 08:00–12:00 | Critical |
| Technical area cleaning, Tuesday and Friday | Weekly | `FREQ=WEEKLY;BYDAY=TU,FR` | | Low |
| Monthly equipment inspection, the 1st | Monthly | `FREQ=MONTHLY;BYMONTHDAY=1` | | High |
| Quarterly compliance review | Monthly, every 3 months | `FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1` | Start date on January 1st | Critical |
| Annual fire safety training | Yearly | `FREQ=YEARLY` | Repeats on the day of the start date | High |

## Details per case

**Daily safety walkthrough.**
- Assign it to the security group and attach the walkthrough procedure (link or PDF).
- Add a checklist: one checkbox per zone, and a photo step for the fire panel.
- A failed walkthrough can open a corrective action straight away.

**Weekly quality audit.**
- A weekly occurrence can be validated at any time during its week.
- The time window keeps it on the board only during the audit slot.
- When the auditor is away, a **delegation** hands it to someone else for that week.

**Monthly and quarterly checks.**
- Use the analytics over 30 or 90 days to follow the completion rate and the delays.
- With a start date on January 1st, the quarterly rule produces January 1st, April 1st, July 1st and October 1st.

**Recurrence from the last completion.**
- Set the recurrence mode to **From Completion** when the next occurrence must follow the last success rather than the calendar. Example: a filter replaced every 30 days of use.

## Several sites

- Every task and every user belongs to a site. Users only see the tasks of their sites.
- Groups belong to a site and restrict assignments and delegations to it.
- Guest TV links are created per site.

Example: a walkthrough defined for the "North warehouse" site only appears to the users of that site.

## Delegations

**Leave or long absence.** On the task, create a delegation from the first to the last day of absence, to one or more colleagues, with the reason "Annual leave".

**Temporary transfer.** The same mechanism hands a task to another team for a while.

The task details list active and planned delegations. The audit log and the reports keep track of the validations made by delegates.

## Notifications

Step 4 of the task wizard sends alerts through the channels enabled in Settings → Notifications (email, Slack, Microsoft Teams, Telegram or web push):

- **On failure**: when an occurrence is reported as failed;
- **On missing**: when an occurrence is missed;
- **Reminder**: before the due time.

Email alerts go to selected users, groups or addresses.
