ALTER TABLE "job" ADD COLUMN IF NOT EXISTS "followupby" INTEGER;

CREATE INDEX IF NOT EXISTS "idx_job_followupby" ON "job"("followupby");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_job_followupby'
  ) THEN
    ALTER TABLE "job"
      ADD CONSTRAINT "fk_job_followupby"
      FOREIGN KEY ("followupby")
      REFERENCES "users"("userid")
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  END IF;
END $$;
