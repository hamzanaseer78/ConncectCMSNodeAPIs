ALTER TABLE "jobcpairparts"
    ADD COLUMN IF NOT EXISTS "tenantid" INTEGER,
    ADD COLUMN IF NOT EXISTS "branchid" INTEGER;

UPDATE "jobcpairparts" AS p
SET
    "tenantid" = s."tenantid",
    "branchid" = s."branchid"
FROM "jobcpairsummary" AS s
WHERE p."jobcpairsummaryid" = s."recno"
  AND (p."tenantid" IS NULL OR p."branchid" IS NULL);

ALTER TABLE "jobcpairparts"
    ALTER COLUMN "tenantid" SET NOT NULL,
    ALTER COLUMN "branchid" SET NOT NULL;

ALTER TABLE "jobcpairparts" DROP CONSTRAINT IF EXISTS "fk_jobcpairparts_tenant";
ALTER TABLE "jobcpairparts" ADD CONSTRAINT "fk_jobcpairparts_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations" ("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobcpairparts" DROP CONSTRAINT IF EXISTS "fk_jobcpairparts_branch";
ALTER TABLE "jobcpairparts" ADD CONSTRAINT "fk_jobcpairparts_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches" ("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "idx_jobcpairparts_tenant_branch"
    ON "jobcpairparts" ("tenantid", "branchid");

ALTER TABLE "jobcpairreceivelog"
    ADD COLUMN IF NOT EXISTS "tenantid" INTEGER,
    ADD COLUMN IF NOT EXISTS "branchid" INTEGER;

UPDATE "jobcpairreceivelog" AS r
SET
    "tenantid" = s."tenantid",
    "branchid" = s."branchid"
FROM "jobcpairsummary" AS s
WHERE r."jobcpairsummaryid" = s."recno"
  AND (r."tenantid" IS NULL OR r."branchid" IS NULL);

ALTER TABLE "jobcpairreceivelog"
    ALTER COLUMN "tenantid" SET NOT NULL,
    ALTER COLUMN "branchid" SET NOT NULL;

ALTER TABLE "jobcpairreceivelog" DROP CONSTRAINT IF EXISTS "fk_jobcpairreceivelog_tenant";
ALTER TABLE "jobcpairreceivelog" ADD CONSTRAINT "fk_jobcpairreceivelog_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations" ("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobcpairreceivelog" DROP CONSTRAINT IF EXISTS "fk_jobcpairreceivelog_branch";
ALTER TABLE "jobcpairreceivelog" ADD CONSTRAINT "fk_jobcpairreceivelog_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches" ("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "idx_jobcpairreceivelog_tenant_branch"
    ON "jobcpairreceivelog" ("tenantid", "branchid");

ALTER TABLE "jobcpairissuelog"
    ADD COLUMN IF NOT EXISTS "tenantid" INTEGER,
    ADD COLUMN IF NOT EXISTS "branchid" INTEGER;

UPDATE "jobcpairissuelog" AS i
SET
    "tenantid" = s."tenantid",
    "branchid" = s."branchid"
FROM "jobcpairsummary" AS s
WHERE i."jobcpairsummaryid" = s."recno"
  AND (i."tenantid" IS NULL OR i."branchid" IS NULL);

ALTER TABLE "jobcpairissuelog"
    ALTER COLUMN "tenantid" SET NOT NULL,
    ALTER COLUMN "branchid" SET NOT NULL;

ALTER TABLE "jobcpairissuelog" DROP CONSTRAINT IF EXISTS "fk_jobcpairissuelog_tenant";
ALTER TABLE "jobcpairissuelog" ADD CONSTRAINT "fk_jobcpairissuelog_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations" ("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobcpairissuelog" DROP CONSTRAINT IF EXISTS "fk_jobcpairissuelog_branch";
ALTER TABLE "jobcpairissuelog" ADD CONSTRAINT "fk_jobcpairissuelog_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches" ("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "idx_jobcpairissuelog_tenant_branch"
    ON "jobcpairissuelog" ("tenantid", "branchid");
