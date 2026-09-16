-- Quotation workflow status on job (separate from job.statusid / jobstatuses).

CREATE TYPE "QuotationStatus" AS ENUM ('created', 'sent', 'approved', 'rejected');

ALTER TABLE "job" ADD COLUMN "quotationstatus" "QuotationStatus" NOT NULL DEFAULT 'created';

CREATE TABLE "jobquotationstatuslog" (
    "recno" SERIAL NOT NULL,
    "jobid" INTEGER,
    "tenantid" INTEGER,
    "branchid" INTEGER,
    "fromstatus" "QuotationStatus",
    "tostatus" "QuotationStatus" NOT NULL,
    "remarks" TEXT,
    "changedby" INTEGER,
    "changedat" TIMESTAMP(6),

    CONSTRAINT "jobquotationstatuslog_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_jsl_jobquotationstatuslog" ON "jobquotationstatuslog"("recno");
CREATE INDEX "idx_jsl_jobquotationstatuslog_job" ON "jobquotationstatuslog"("jobid", "changedat");

ALTER TABLE "jobquotationstatuslog" ADD CONSTRAINT "fk_jsl_jobquotationstatuslog_job" FOREIGN KEY ("jobid") REFERENCES "job"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "jobquotationstatuslog" ADD CONSTRAINT "fk_jsl_jobquotationstatuslog_tenant" FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "jobquotationstatuslog" ADD CONSTRAINT "fk_jsl_jobquotationstatuslog_branch" FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "jobquotationstatuslog" ADD CONSTRAINT "fk_jsl_jobquotationstatuslog_changedby" FOREIGN KEY ("changedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
