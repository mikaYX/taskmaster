-- A group member can be marked as a lead of the team (several leads per group are allowed).
ALTER TABLE "user_group_memberships" ADD COLUMN "is_lead" BOOLEAN NOT NULL DEFAULT false;
