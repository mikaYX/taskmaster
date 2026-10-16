-- Additive only: existing tasks have no checklist and keep their validation flow.
ALTER TABLE "tasks" ADD COLUMN "execution_checklist" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "statuses" ADD COLUMN "execution_record" JSONB;

CREATE TABLE "task_evidence" (
  "id" UUID NOT NULL,
  "task_id" INTEGER NOT NULL,
  "instance_date" DATE NOT NULL,
  "uploader_id" INTEGER NOT NULL,
  "mime_type" VARCHAR(50) NOT NULL,
  "size" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_evidence_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_evidence_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "task_evidence_task_id_instance_date_idx" ON "task_evidence"("task_id", "instance_date");

CREATE TABLE "corrective_actions" (
  "id" SERIAL NOT NULL,
  "task_id" INTEGER NOT NULL,
  "instance_date" DATE NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "assignee_id" INTEGER NOT NULL,
  "created_by_id" INTEGER NOT NULL,
  "due_date" DATE,
  "state" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT,
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "corrective_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "corrective_actions_state_check" CHECK ("state" IN ('OPEN', 'CLOSED')),
  CONSTRAINT "corrective_actions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "corrective_actions_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "corrective_actions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "corrective_actions_task_id_instance_date_key" ON "corrective_actions"("task_id", "instance_date");
CREATE INDEX "corrective_actions_assignee_id_state_idx" ON "corrective_actions"("assignee_id", "state");
CREATE INDEX "corrective_actions_state_due_date_idx" ON "corrective_actions"("state", "due_date");
