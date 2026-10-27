-- Email reminders become opt-in: each person turns them on for themselves.
-- v2 was only on a test server, so nobody has chosen yet: reset the default value everyone got.
ALTER TABLE "users" ALTER COLUMN "todo_reminder_email" SET DEFAULT false;
UPDATE "users" SET "todo_reminder_email" = false;
