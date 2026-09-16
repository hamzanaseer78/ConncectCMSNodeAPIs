CREATE TABLE IF NOT EXISTS "jobcashsettings" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "allowreceivecollection" BOOLEAN NOT NULL DEFAULT false,
    "allowaddexpenses" BOOLEAN NOT NULL DEFAULT false,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "jobcashsettings_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_jobcashsettings_tenant_branch"
    ON "jobcashsettings" ("tenantid", "branchid");

CREATE INDEX IF NOT EXISTS "idx_jobcashsettings_tenant_branch"
    ON "jobcashsettings" ("tenantid", "branchid");

ALTER TABLE "jobcashsettings" DROP CONSTRAINT IF EXISTS "fk_jobcashsettings_branch";
ALTER TABLE "jobcashsettings" ADD CONSTRAINT "fk_jobcashsettings_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches" ("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobcashsettings" DROP CONSTRAINT IF EXISTS "fk_jobcashsettings_tenant";
ALTER TABLE "jobcashsettings" ADD CONSTRAINT "fk_jobcashsettings_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations" ("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE IF NOT EXISTS "jobcollections" (
    "recno" SERIAL NOT NULL,
    "jobid" INTEGER NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,
    "collectedby" INTEGER NOT NULL,
    "collectedat" TIMESTAMP(6) NOT NULL,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "jobcollections_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_jobcollections_jobid"
    ON "jobcollections" ("jobid");

CREATE INDEX IF NOT EXISTS "idx_jobcollections_tenant_branch_collectedat"
    ON "jobcollections" ("tenantid", "branchid", "collectedat");

ALTER TABLE "jobcollections" DROP CONSTRAINT IF EXISTS "fk_jobcollections_job";
ALTER TABLE "jobcollections" ADD CONSTRAINT "fk_jobcollections_job"
    FOREIGN KEY ("jobid") REFERENCES "job" ("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobcollections" DROP CONSTRAINT IF EXISTS "fk_jobcollections_branch";
ALTER TABLE "jobcollections" ADD CONSTRAINT "fk_jobcollections_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches" ("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobcollections" DROP CONSTRAINT IF EXISTS "fk_jobcollections_tenant";
ALTER TABLE "jobcollections" ADD CONSTRAINT "fk_jobcollections_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations" ("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE IF NOT EXISTS "jobexpenses" (
    "recno" SERIAL NOT NULL,
    "jobid" INTEGER NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "jobexpenses_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX IF NOT EXISTS "idx_jobexpenses_jobid"
    ON "jobexpenses" ("jobid");

CREATE INDEX IF NOT EXISTS "idx_jobexpenses_tenant_branch_jobid"
    ON "jobexpenses" ("tenantid", "branchid", "jobid");

ALTER TABLE "jobexpenses" DROP CONSTRAINT IF EXISTS "fk_jobexpenses_job";
ALTER TABLE "jobexpenses" ADD CONSTRAINT "fk_jobexpenses_job"
    FOREIGN KEY ("jobid") REFERENCES "job" ("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobexpenses" DROP CONSTRAINT IF EXISTS "fk_jobexpenses_branch";
ALTER TABLE "jobexpenses" ADD CONSTRAINT "fk_jobexpenses_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches" ("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobexpenses" DROP CONSTRAINT IF EXISTS "fk_jobexpenses_tenant";
ALTER TABLE "jobexpenses" ADD CONSTRAINT "fk_jobexpenses_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations" ("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;
