-- Task: leave a task out of analytics (it still runs and notifies).
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "exclude_from_analytics" BOOLEAN NOT NULL DEFAULT false;

-- Todo discussions. Existing comments are created as already read ("legacy_read" defaults to true
-- while the column is added), then new rows default to false.
ALTER TABLE "todo_comments" ADD COLUMN IF NOT EXISTS "parent_id" INTEGER;
ALTER TABLE "todo_comments" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "todo_comments" ADD COLUMN IF NOT EXISTS "legacy_read" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "todo_comments" ALTER COLUMN "legacy_read" SET DEFAULT false;

CREATE TABLE IF NOT EXISTS "todo_comment_mentions" (
    "id" SERIAL NOT NULL,
    "comment_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "group_id" INTEGER,

    CONSTRAINT "todo_comment_mentions_pkey" PRIMARY KEY ("id"),
    -- A mention targets exactly one person or one team.
    CONSTRAINT "todo_comment_mentions_one_target_chk" CHECK (("user_id" IS NULL) <> ("group_id" IS NULL))
);

CREATE TABLE IF NOT EXISTS "todo_comment_reads" (
    "todo_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "last_read_comment_id" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "todo_comment_reads_pkey" PRIMARY KEY ("todo_id","user_id")
);

CREATE INDEX IF NOT EXISTS "todo_comment_mentions_comment_id_idx" ON "todo_comment_mentions"("comment_id");
CREATE INDEX IF NOT EXISTS "todo_comment_reads_user_id_idx" ON "todo_comment_reads"("user_id");
CREATE INDEX IF NOT EXISTS "todo_comments_parent_id_idx" ON "todo_comments"("parent_id");

ALTER TABLE "todo_comments" ADD CONSTRAINT "todo_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "todo_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "todo_comment_mentions" ADD CONSTRAINT "todo_comment_mentions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "todo_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "todo_comment_mentions" ADD CONSTRAINT "todo_comment_mentions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "todo_comment_mentions" ADD CONSTRAINT "todo_comment_mentions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "todo_comment_reads" ADD CONSTRAINT "todo_comment_reads_todo_id_fkey" FOREIGN KEY ("todo_id") REFERENCES "todos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "todo_comment_reads" ADD CONSTRAINT "todo_comment_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A reply and its parent always belong to the same todo, and a thread has one level only.
CREATE OR REPLACE FUNCTION "todo_comments_check_parent"() RETURNS trigger AS $fn$
DECLARE
  parent_todo INTEGER;
  parent_parent INTEGER;
BEGIN
  IF NEW."parent_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "todo_id", "parent_id" INTO parent_todo, parent_parent
    FROM "todo_comments" WHERE "id" = NEW."parent_id";
  IF parent_todo IS NULL OR parent_todo <> NEW."todo_id" THEN
    RAISE EXCEPTION 'A reply must belong to the same todo as its parent comment';
  END IF;
  IF parent_parent IS NOT NULL THEN
    RAISE EXCEPTION 'A reply cannot be nested under another reply';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER "todo_comments_check_parent_trg"
  BEFORE INSERT OR UPDATE OF "parent_id", "todo_id" ON "todo_comments"
  FOR EACH ROW EXECUTE FUNCTION "todo_comments_check_parent"();
