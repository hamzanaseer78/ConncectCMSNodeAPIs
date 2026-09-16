-- One jobdetails row per job: remove duplicates (keep earliest recno), then enforce uniqueness.

DELETE FROM "jobdetails" AS dup
USING "jobdetails" AS keep
WHERE dup."jobid" IS NOT NULL
  AND dup."jobid" = keep."jobid"
  AND dup."recno" > keep."recno";

CREATE UNIQUE INDEX IF NOT EXISTS "jobdetails_jobid_unique" ON "jobdetails" ("jobid");
