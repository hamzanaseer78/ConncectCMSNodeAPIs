-- Tracking ping: tie location to a job; optional address on ping.
ALTER TABLE "userlocations" ADD COLUMN IF NOT EXISTS "jobid" INTEGER;
ALTER TABLE "userlocations" ADD COLUMN IF NOT EXISTS "address" TEXT;

CREATE INDEX IF NOT EXISTS "idx_userlocations_job_time" ON "userlocations" ("jobid", "recordedat");

ALTER TABLE "userlocations" DROP CONSTRAINT IF EXISTS "fk_userlocations_job";
ALTER TABLE "userlocations" ADD CONSTRAINT "fk_userlocations_job"
  FOREIGN KEY ("jobid") REFERENCES "job"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Job work start/end location (mirrors jobtravelhistory).
ALTER TABLE "jobworklhistory" ADD COLUMN IF NOT EXISTS "startlatitude" VARCHAR(20);
ALTER TABLE "jobworklhistory" ADD COLUMN IF NOT EXISTS "startlongitude" VARCHAR(20);
ALTER TABLE "jobworklhistory" ADD COLUMN IF NOT EXISTS "startaddress" TEXT;
ALTER TABLE "jobworklhistory" ADD COLUMN IF NOT EXISTS "stoplatitude" VARCHAR(20);
ALTER TABLE "jobworklhistory" ADD COLUMN IF NOT EXISTS "stoplongitude" VARCHAR(20);
ALTER TABLE "jobworklhistory" ADD COLUMN IF NOT EXISTS "stopaddress" TEXT;
