-- Tenant-scoped job sources (where a job lead came from).

CREATE TABLE "jobsources" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER,
    "name" TEXT,
    "description" TEXT,
    "isactive" BOOLEAN,
    "sort" INTEGER,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "jobsources_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_jsl_jobsources" ON "jobsources"("recno");

ALTER TABLE "jobsources" ADD CONSTRAINT "fk_jsl_jobsources_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobsources" ADD CONSTRAINT "fk_jsl_jobsources_createdby"
    FOREIGN KEY ("createdby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobsources" ADD CONSTRAINT "fk_jsl_jobsources_lastupdatedby"
    FOREIGN KEY ("lastupdatedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "job" ADD COLUMN "jobsourceid" INTEGER;

ALTER TABLE "job" ADD CONSTRAINT "fk_jsl_job_jobsource"
    FOREIGN KEY ("jobsourceid") REFERENCES "jobsources"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;
