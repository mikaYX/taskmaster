-- A corrective action goes to one person or to one team.
ALTER TABLE "corrective_actions" ALTER COLUMN "assignee_id" DROP NOT NULL;
ALTER TABLE "corrective_actions" ADD COLUMN "assignee_group_id" INTEGER;
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_assignee_group_id_fkey" FOREIGN KEY ("assignee_group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_one_assignee_check" CHECK (("assignee_id" IS NULL) <> ("assignee_group_id" IS NULL));
CREATE INDEX "corrective_actions_assignee_group_id_state_idx" ON "corrective_actions"("assignee_group_id", "state");
