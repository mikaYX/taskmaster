-- AlterTable
ALTER TABLE "task_notifications" ADD COLUMN "reminder_offset_minutes" INTEGER NOT NULL DEFAULT 60;
