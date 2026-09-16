-- One login email per user (case-insensitive). NULL emails are allowed for legacy rows.
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_unique"
  ON "users" (LOWER("email"))
  WHERE "email" IS NOT NULL AND TRIM("email") <> '';
