ALTER TABLE "jobquotationsettings"
ADD COLUMN IF NOT EXISTS "automaticcpairreceiving" BOOLEAN NOT NULL DEFAULT false;
