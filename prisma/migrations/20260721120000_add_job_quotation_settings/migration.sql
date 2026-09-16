ALTER TABLE "job" ADD COLUMN IF NOT EXISTS "quotationnotes" TEXT;
ALTER TABLE "job" ADD COLUMN IF NOT EXISTS "quotationterms" TEXT;

CREATE TABLE IF NOT EXISTS "jobquotationsettings" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "defaultnotes" TEXT,
    "defaulttermsandconditions" TEXT,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "jobquotationsettings_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_jobquotationsettings_tenant_branch"
    ON "jobquotationsettings" ("tenantid", "branchid");

CREATE INDEX IF NOT EXISTS "idx_jobquotationsettings_tenant_branch"
    ON "jobquotationsettings" ("tenantid", "branchid");

ALTER TABLE "jobquotationsettings" DROP CONSTRAINT IF EXISTS "fk_jobquotationsettings_branch";
ALTER TABLE "jobquotationsettings" ADD CONSTRAINT "fk_jobquotationsettings_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches" ("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobquotationsettings" DROP CONSTRAINT IF EXISTS "fk_jobquotationsettings_tenant";
ALTER TABLE "jobquotationsettings" ADD CONSTRAINT "fk_jobquotationsettings_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations" ("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;
