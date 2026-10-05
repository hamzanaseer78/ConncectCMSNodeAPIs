CREATE TABLE IF NOT EXISTS "organizationaisettings" (
  "recno" SERIAL NOT NULL,
  "tenantid" INTEGER NOT NULL,
  "provider" VARCHAR(20),
  "apikeycipher" TEXT,
  "questionsused" INTEGER NOT NULL DEFAULT 0,
  "createdby" INTEGER,
  "createdat" TIMESTAMP(6),
  "lastupdatedby" INTEGER,
  "lastupdatedat" TIMESTAMP(6),
  CONSTRAINT "organizationaisettings_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_organizationaisettings_tenantid"
  ON "organizationaisettings"("tenantid");

CREATE INDEX IF NOT EXISTS "idx_organizationaisettings_tenantid"
  ON "organizationaisettings"("tenantid");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_organizationaisettings_tenant'
  ) THEN
    ALTER TABLE "organizationaisettings"
      ADD CONSTRAINT "fk_organizationaisettings_tenant"
      FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;
