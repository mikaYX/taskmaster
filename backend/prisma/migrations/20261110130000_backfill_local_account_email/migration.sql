-- The setup wizard asks for an email address and stored it only as the username, so the first
-- administrator (and any local account created the same way) had no email: the profile page
-- showed none and the automatic export skipped the account. Copy an address-shaped username
-- into the empty email column. Only local, non-deleted accounts with no email are touched.
UPDATE "users"
SET "email" = "username"
WHERE "email" IS NULL
  AND "auth_provider" = 'LOCAL'
  AND "deleted_at" IS NULL
  AND "username" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
