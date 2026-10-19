-- Additive only. Todos gain notes, subtasks (one level), recurrence, a
-- "completed by" trace and a reminder marker. Existing rows keep working as-is.
CREATE TYPE "TodoRecurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');

ALTER TABLE "todos"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "recurrence" "TodoRecurrence" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "parent_id" INTEGER,
  ADD COLUMN "completed_by_id" INTEGER,
  ADD COLUMN "reminder_sent_at" TIMESTAMP(3);

ALTER TABLE "todos"
  ADD CONSTRAINT "todos_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "todos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "todos_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "todos_parent_id_idx" ON "todos"("parent_id");
