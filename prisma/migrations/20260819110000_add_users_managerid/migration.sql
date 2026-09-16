ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "managerid" INTEGER;

CREATE INDEX IF NOT EXISTS "idx_users_managerid" ON "users"("managerid");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_users_manager'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "fk_users_manager"
      FOREIGN KEY ("managerid")
      REFERENCES "users"("userid")
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  END IF;
END $$;
