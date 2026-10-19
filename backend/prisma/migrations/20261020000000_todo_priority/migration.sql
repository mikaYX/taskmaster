-- Additive only. Todos get a priority; existing ones become NORMAL.
CREATE TYPE "TodoPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

ALTER TABLE "todos" ADD COLUMN "priority" "TodoPriority" NOT NULL DEFAULT 'NORMAL';

CREATE INDEX "todos_site_id_scope_is_completed_idx" ON "todos"("site_id", "scope", "is_completed");
