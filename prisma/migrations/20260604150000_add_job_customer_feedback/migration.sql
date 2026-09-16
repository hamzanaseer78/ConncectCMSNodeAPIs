-- Customer feedback captured at job completion (rating 0-5, comments, who recorded it).

CREATE TABLE "jobcustomerfeedback" (
    "recno" SERIAL NOT NULL,
    "jobid" INTEGER NOT NULL,
    "tenantid" INTEGER,
    "branchid" INTEGER,
    "rating" INTEGER NOT NULL,
    "comments" TEXT,
    "recordedby" INTEGER,
    "recordedat" TIMESTAMP(6),

    CONSTRAINT "jobcustomerfeedback_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX "jobcustomerfeedback_jobid_key" ON "jobcustomerfeedback"("jobid");
CREATE INDEX "idx_jsl_jobcustomerfeedback" ON "jobcustomerfeedback"("recno");

ALTER TABLE "jobcustomerfeedback" ADD CONSTRAINT "fk_jsl_jobcustomerfeedback_job" FOREIGN KEY ("jobid") REFERENCES "job"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "jobcustomerfeedback" ADD CONSTRAINT "fk_jsl_jobcustomerfeedback_tenant" FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "jobcustomerfeedback" ADD CONSTRAINT "fk_jsl_jobcustomerfeedback_branch" FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "jobcustomerfeedback" ADD CONSTRAINT "fk_jsl_jobcustomerfeedback_recordedby" FOREIGN KEY ("recordedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
