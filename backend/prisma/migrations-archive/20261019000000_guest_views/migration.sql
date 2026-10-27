-- Additive only. A TV (GUEST) account can now be limited to the task board or to
-- the analytics, so a site can have one link of each kind.
CREATE TYPE "GuestView" AS ENUM ('DASHBOARD', 'ANALYTICS');

ALTER TABLE "users" ADD COLUMN "guest_view" "GuestView";

-- Existing TV accounts keep showing the board.
UPDATE "users" SET "guest_view" = 'DASHBOARD' WHERE "role" = 'GUEST';
