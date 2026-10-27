-- New accounts get todo emails by default; existing accounts keep their choice.
ALTER TABLE "users" ALTER COLUMN "todo_reminder_email" SET DEFAULT true;
