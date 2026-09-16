ALTER TABLE "jobquotationsettings"
ADD COLUMN IF NOT EXISTS "enablelineitemtax" BOOLEAN NOT NULL DEFAULT false;
