CREATE TYPE "CpairReceiveStatus" AS ENUM ('pending', 'partially_received', 'all_received');
CREATE TYPE "CpairIssueStatus" AS ENUM ('pending', 'partially_issued', 'issued');

CREATE TABLE IF NOT EXISTS "jobcpairsummary" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "jobid" INTEGER NOT NULL,
    "customerid" INTEGER,
    "customername" TEXT,
    "technicianid" INTEGER,
    "technicianname" TEXT,
    "faultid" INTEGER,
    "faultname" TEXT,
    "totalinstalledqty" INTEGER NOT NULL DEFAULT 0,
    "totalcpairqty" INTEGER NOT NULL DEFAULT 0,
    "totalwastageqty" INTEGER NOT NULL DEFAULT 0,
    "totalqtyreceived" INTEGER NOT NULL DEFAULT 0,
    "totalissueqty" INTEGER NOT NULL DEFAULT 0,
    "receivestatus" "CpairReceiveStatus" NOT NULL DEFAULT 'pending',
    "issuestatus" "CpairIssueStatus" NOT NULL DEFAULT 'pending',
    "lastreceiveddate" TIMESTAMP(6),
    "lastissuedate" TIMESTAMP(6),
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "jobcpairsummary_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_jobcpairsummary_jobid"
    ON "jobcpairsummary" ("jobid");

CREATE INDEX IF NOT EXISTS "idx_jobcpairsummary_tenant_branch"
    ON "jobcpairsummary" ("tenantid", "branchid");

CREATE INDEX IF NOT EXISTS "idx_jobcpairsummary_receivestatus"
    ON "jobcpairsummary" ("tenantid", "branchid", "receivestatus");

ALTER TABLE "jobcpairsummary" DROP CONSTRAINT IF EXISTS "fk_jobcpairsummary_job";
ALTER TABLE "jobcpairsummary" ADD CONSTRAINT "fk_jobcpairsummary_job"
    FOREIGN KEY ("jobid") REFERENCES "job" ("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobcpairsummary" DROP CONSTRAINT IF EXISTS "fk_jobcpairsummary_branch";
ALTER TABLE "jobcpairsummary" ADD CONSTRAINT "fk_jobcpairsummary_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches" ("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobcpairsummary" DROP CONSTRAINT IF EXISTS "fk_jobcpairsummary_tenant";
ALTER TABLE "jobcpairsummary" ADD CONSTRAINT "fk_jobcpairsummary_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations" ("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE IF NOT EXISTS "jobcpairparts" (
    "recno" SERIAL NOT NULL,
    "jobcpairsummaryid" INTEGER NOT NULL,
    "jobid" INTEGER NOT NULL,
    "jobproductid" INTEGER NOT NULL,
    "productid" INTEGER,
    "partname" TEXT,
    "installedqty" INTEGER NOT NULL DEFAULT 0,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "wastageqty" INTEGER NOT NULL DEFAULT 0,
    "lineqtyreceived" INTEGER NOT NULL DEFAULT 0,
    "lineissueqty" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "images" TEXT,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "jobcpairparts_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_jobcpairparts_jobproductid"
    ON "jobcpairparts" ("jobproductid");

CREATE INDEX IF NOT EXISTS "idx_jobcpairparts_summary"
    ON "jobcpairparts" ("jobcpairsummaryid");

ALTER TABLE "jobcpairparts" DROP CONSTRAINT IF EXISTS "fk_jobcpairparts_summary";
ALTER TABLE "jobcpairparts" ADD CONSTRAINT "fk_jobcpairparts_summary"
    FOREIGN KEY ("jobcpairsummaryid") REFERENCES "jobcpairsummary" ("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobcpairparts" DROP CONSTRAINT IF EXISTS "fk_jobcpairparts_job";
ALTER TABLE "jobcpairparts" ADD CONSTRAINT "fk_jobcpairparts_job"
    FOREIGN KEY ("jobid") REFERENCES "job" ("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE IF NOT EXISTS "jobcpairreceivelog" (
    "recno" SERIAL NOT NULL,
    "jobcpairpartid" INTEGER NOT NULL,
    "jobcpairsummaryid" INTEGER NOT NULL,
    "qtyreceived" INTEGER NOT NULL,
    "receivedby" INTEGER NOT NULL,
    "handedoverby" INTEGER,
    "receiveddate" TIMESTAMP(6) NOT NULL,
    "remarks" TEXT,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),

    CONSTRAINT "jobcpairreceivelog_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX IF NOT EXISTS "idx_jobcpairreceivelog_summary"
    ON "jobcpairreceivelog" ("jobcpairsummaryid");

ALTER TABLE "jobcpairreceivelog" DROP CONSTRAINT IF EXISTS "fk_jobcpairreceivelog_part";
ALTER TABLE "jobcpairreceivelog" ADD CONSTRAINT "fk_jobcpairreceivelog_part"
    FOREIGN KEY ("jobcpairpartid") REFERENCES "jobcpairparts" ("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobcpairreceivelog" DROP CONSTRAINT IF EXISTS "fk_jobcpairreceivelog_summary";
ALTER TABLE "jobcpairreceivelog" ADD CONSTRAINT "fk_jobcpairreceivelog_summary"
    FOREIGN KEY ("jobcpairsummaryid") REFERENCES "jobcpairsummary" ("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE IF NOT EXISTS "jobcpairissuelog" (
    "recno" SERIAL NOT NULL,
    "jobcpairpartid" INTEGER NOT NULL,
    "jobcpairsummaryid" INTEGER NOT NULL,
    "issueqty" INTEGER NOT NULL,
    "issuedby" INTEGER NOT NULL,
    "storename" TEXT,
    "issuedate" TIMESTAMP(6) NOT NULL,
    "remarks" TEXT,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),

    CONSTRAINT "jobcpairissuelog_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX IF NOT EXISTS "idx_jobcpairissuelog_summary"
    ON "jobcpairissuelog" ("jobcpairsummaryid");

ALTER TABLE "jobcpairissuelog" DROP CONSTRAINT IF EXISTS "fk_jobcpairissuelog_part";
ALTER TABLE "jobcpairissuelog" ADD CONSTRAINT "fk_jobcpairissuelog_part"
    FOREIGN KEY ("jobcpairpartid") REFERENCES "jobcpairparts" ("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobcpairissuelog" DROP CONSTRAINT IF EXISTS "fk_jobcpairissuelog_summary";
ALTER TABLE "jobcpairissuelog" ADD CONSTRAINT "fk_jobcpairissuelog_summary"
    FOREIGN KEY ("jobcpairsummaryid") REFERENCES "jobcpairsummary" ("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;
