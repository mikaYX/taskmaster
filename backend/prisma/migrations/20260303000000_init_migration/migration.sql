-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'LDAP', 'AZURE_AD', 'OIDC', 'SAML');

-- CreateEnum
CREATE TYPE "OverrideAction" AS ENUM ('MOVE', 'SKIP');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('SUCCESS', 'FAILED', 'MISSING', 'RUNNING');

-- CreateEnum
CREATE TYPE "NotificationChannelType" AS ENUM ('SLACK', 'TEAMS', 'EMAIL', 'TELEGRAM', 'PUSH');

-- CreateEnum
CREATE TYPE "TodoScope" AS ENUM ('PRIVATE', 'COLLECTIVE');

-- CreateTable
CREATE TABLE "configs" (
    "key" VARCHAR(255) NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configs_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "fullname" VARCHAR(255),
    "email" VARCHAR(255),
    "password_hash" VARCHAR(255),
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "auth_provider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
    "external_id" VARCHAR(255),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_recovery_codes_hash" TEXT,
    "mfa_secret_encrypted" VARCHAR(255),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "parent_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_site_assignments" (
    "user_id" INTEGER NOT NULL,
    "site_id" INTEGER NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_site_assignments_pkey" PRIMARY KEY ("user_id","site_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "family_id" VARCHAR(36) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" VARCHAR(255),
    "ip_address" VARCHAR(45),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passkeys" (
    "id" VARCHAR(255) NOT NULL,
    "public_key" BYTEA NOT NULL,
    "user_id" INTEGER NOT NULL,
    "counter" BIGINT NOT NULL,
    "device_type" VARCHAR(32) NOT NULL,
    "backed_up" BOOLEAN NOT NULL,
    "transports" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "name" VARCHAR(255),

    CONSTRAINT "passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "site_id" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_group_memberships" (
    "user_id" INTEGER NOT NULL,
    "group_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_group_memberships_pkey" PRIMARY KEY ("user_id","group_id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" SERIAL NOT NULL,
    "periodicity" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL,
    "procedure_url" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "active_until" DATE,
    "skip_weekends" BOOLEAN NOT NULL DEFAULT true,
    "skip_holidays" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "due_offset" INTEGER,
    "recurrence_mode" VARCHAR(50) NOT NULL DEFAULT 'ON_SCHEDULE',
    "rrule" TEXT,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "use_global_window_defaults" BOOLEAN NOT NULL DEFAULT true,
    "window_end_time" VARCHAR(5),
    "window_start_time" VARCHAR(5),
    "is_continuous_block" BOOLEAN NOT NULL DEFAULT false,
    "name" VARCHAR(255) NOT NULL,
    "priority" VARCHAR(50) NOT NULL DEFAULT 'MEDIUM',
    "project" VARCHAR(255),
    "category" VARCHAR(255),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "site_id" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_occurrence_overrides" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "original_date" DATE NOT NULL,
    "action" "OverrideAction" NOT NULL,
    "target_date" DATE,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_occurrence_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "recurrence_mode" VARCHAR(20) NOT NULL DEFAULT 'ON_SCHEDULE',
    "rrule" TEXT,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "open_offset" INTEGER NOT NULL DEFAULT 0,
    "close_offset" INTEGER,
    "due_offset" INTEGER,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "max_occurrences" INTEGER,
    "occurrence_count" INTEGER NOT NULL DEFAULT 0,
    "ends_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "label" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "site_id" INTEGER,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "task_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "site_id" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("task_id","user_id")
);

-- CreateTable
CREATE TABLE "task_group_assignments" (
    "task_id" INTEGER NOT NULL,
    "group_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "site_id" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "task_group_assignments_pkey" PRIMARY KEY ("task_id","group_id")
);

-- CreateTable
CREATE TABLE "task_delegations" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "delegate_user_id" INTEGER,
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delegated_by_id" INTEGER,
    "end_at" TIMESTAMPTZ(6),
    "expired_notified_at" TIMESTAMPTZ(6),
    "reason" TEXT,
    "start_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_delegation_target_users" (
    "delegation_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "task_delegation_target_users_pkey" PRIMARY KEY ("delegation_id","user_id")
);

-- CreateTable
CREATE TABLE "task_delegation_target_groups" (
    "delegation_id" INTEGER NOT NULL,
    "group_id" INTEGER NOT NULL,

    CONSTRAINT "task_delegation_target_groups_pkey" PRIMARY KEY ("delegation_id","group_id")
);

-- CreateTable
CREATE TABLE "statuses" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "instance_date" DATE NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'RUNNING',
    "comment" TEXT,
    "updated_by_user_id" INTEGER,
    "updated_by_username" VARCHAR(255),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" INTEGER,
    "actor_name" TEXT,
    "action" VARCHAR(100) NOT NULL,
    "target" VARCHAR(100),
    "category" VARCHAR(50) NOT NULL,
    "severity" VARCHAR(20) NOT NULL DEFAULT 'INFO',
    "details" TEXT,
    "ip_address" VARCHAR(45),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" SERIAL NOT NULL,
    "key_prefix" VARCHAR(8) NOT NULL,
    "hashed_key" VARCHAR(255) NOT NULL,
    "scopes" TEXT[],
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(100),
    "description" VARCHAR(255),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" SERIAL NOT NULL,
    "type" "NotificationChannelType" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "config" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_notifications" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "channel_id" INTEGER NOT NULL,
    "notify_on_failed" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_overdue" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_reminder" BOOLEAN NOT NULL DEFAULT false,
    "email_user_ids" JSONB,
    "email_group_ids" JSONB,
    "email_custom" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todos" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "scope" "TodoScope" NOT NULL DEFAULT 'PRIVATE',
    "user_id" INTEGER NOT NULL,
    "group_id" INTEGER,
    "site_id" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_external_id_idx" ON "users"("external_id");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sites_code_key" ON "sites"("code");

-- CreateIndex
CREATE INDEX "sites_parent_id_idx" ON "sites"("parent_id");

-- CreateIndex
CREATE INDEX "user_site_assignments_user_id_idx" ON "user_site_assignments"("user_id");

-- CreateIndex
CREATE INDEX "user_site_assignments_site_id_idx" ON "user_site_assignments"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "passkeys_user_id_idx" ON "passkeys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_name_key" ON "groups"("name");

-- CreateIndex
CREATE INDEX "groups_site_id_idx" ON "groups"("site_id");

-- CreateIndex
CREATE INDEX "groups_deleted_at_idx" ON "groups"("deleted_at");

-- CreateIndex
CREATE INDEX "tasks_site_id_idx" ON "tasks"("site_id");

-- CreateIndex
CREATE INDEX "tasks_start_date_idx" ON "tasks"("start_date");

-- CreateIndex
CREATE INDEX "tasks_active_until_idx" ON "tasks"("active_until");

-- CreateIndex
CREATE INDEX "tasks_deleted_at_idx" ON "tasks"("deleted_at");

-- CreateIndex
CREATE INDEX "task_occurrence_overrides_task_id_original_date_idx" ON "task_occurrence_overrides"("task_id", "original_date");

-- CreateIndex
CREATE UNIQUE INDEX "task_occurrence_overrides_task_id_original_date_key" ON "task_occurrence_overrides"("task_id", "original_date");

-- CreateIndex
CREATE INDEX "schedules_task_id_idx" ON "schedules"("task_id");

-- CreateIndex
CREATE INDEX "schedules_status_idx" ON "schedules"("status");

-- CreateIndex
CREATE INDEX "schedules_site_id_idx" ON "schedules"("site_id");

-- CreateIndex
CREATE INDEX "task_assignments_site_id_idx" ON "task_assignments"("site_id");

-- CreateIndex
CREATE INDEX "task_group_assignments_site_id_idx" ON "task_group_assignments"("site_id");

-- CreateIndex
CREATE INDEX "statuses_instance_date_idx" ON "statuses"("instance_date");

-- CreateIndex
CREATE INDEX "statuses_status_idx" ON "statuses"("status");

-- CreateIndex
CREATE UNIQUE INDEX "statuses_task_id_instance_date_key" ON "statuses"("task_id", "instance_date");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_task_id_kind_sent_at_key" ON "notifications"("task_id", "kind", "sent_at");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_category_idx" ON "audit_logs"("category");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "api_keys_prefix_idx" ON "api_keys"("key_prefix");

-- CreateIndex
CREATE INDEX "task_notifications_task_id_idx" ON "task_notifications"("task_id");

-- CreateIndex
CREATE INDEX "task_notifications_channel_id_idx" ON "task_notifications"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_notifications_task_id_channel_id_key" ON "task_notifications"("task_id", "channel_id");

-- CreateIndex
CREATE INDEX "todos_user_id_idx" ON "todos"("user_id");

-- CreateIndex
CREATE INDEX "todos_site_id_idx" ON "todos"("site_id");

-- CreateIndex
CREATE INDEX "todos_group_id_idx" ON "todos"("group_id");

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_site_assignments" ADD CONSTRAINT "user_site_assignments_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_site_assignments" ADD CONSTRAINT "user_site_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group_memberships" ADD CONSTRAINT "user_group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group_memberships" ADD CONSTRAINT "user_group_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_occurrence_overrides" ADD CONSTRAINT "task_occurrence_overrides_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_group_assignments" ADD CONSTRAINT "task_group_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_group_assignments" ADD CONSTRAINT "task_group_assignments_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_group_assignments" ADD CONSTRAINT "task_group_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_delegations" ADD CONSTRAINT "task_delegations_delegate_user_id_fkey" FOREIGN KEY ("delegate_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_delegations" ADD CONSTRAINT "task_delegations_delegated_by_id_fkey" FOREIGN KEY ("delegated_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_delegations" ADD CONSTRAINT "task_delegations_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_delegation_target_users" ADD CONSTRAINT "task_delegation_target_users_delegation_id_fkey" FOREIGN KEY ("delegation_id") REFERENCES "task_delegations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_delegation_target_users" ADD CONSTRAINT "task_delegation_target_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_delegation_target_groups" ADD CONSTRAINT "task_delegation_target_groups_delegation_id_fkey" FOREIGN KEY ("delegation_id") REFERENCES "task_delegations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_delegation_target_groups" ADD CONSTRAINT "task_delegation_target_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_notifications" ADD CONSTRAINT "task_notifications_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "notification_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_notifications" ADD CONSTRAINT "task_notifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

