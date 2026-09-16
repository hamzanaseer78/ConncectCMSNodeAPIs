-- Tenant-scoped job types (new installation, maintenance, warranty, etc.)

CREATE TABLE "jobtypes" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER,
    "name" TEXT,
    "isactive" BOOLEAN,
    "sort" INTEGER,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "jobtypes_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_jsl_jobtypes" ON "jobtypes"("recno");

ALTER TABLE "jobtypes" ADD CONSTRAINT "fk_jsl_jobtypes_tenant" FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobtypes" ADD CONSTRAINT "fk_jsl_jobtypes_createdby" FOREIGN KEY ("createdby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobtypes" ADD CONSTRAINT "fk_jsl_jobtypes_lastupdatedby" FOREIGN KEY ("lastupdatedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "job" ADD COLUMN "jobtypeid" INTEGER;

ALTER TABLE "job" ADD CONSTRAINT "fk_jsl_job_jobtype" FOREIGN KEY ("jobtypeid") REFERENCES "jobtypes"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;
