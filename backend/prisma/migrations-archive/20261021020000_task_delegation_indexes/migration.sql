-- CreateIndex
CREATE INDEX "task_delegations_task_id_idx" ON "task_delegations"("task_id");

-- CreateIndex
CREATE INDEX "task_delegations_delegate_user_id_idx" ON "task_delegations"("delegate_user_id");

-- CreateIndex
CREATE INDEX "task_delegations_delegated_by_id_idx" ON "task_delegations"("delegated_by_id");

