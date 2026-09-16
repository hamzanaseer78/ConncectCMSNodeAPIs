ALTER TABLE "job"
  ADD COLUMN IF NOT EXISTS "groupid" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_jsl_job_group'
  ) THEN
    ALTER TABLE "job"
      ADD CONSTRAINT "fk_jsl_job_group"
      FOREIGN KEY ("groupid") REFERENCES "jobgroups"("groupid")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_job_groupid" ON "job"("groupid");
