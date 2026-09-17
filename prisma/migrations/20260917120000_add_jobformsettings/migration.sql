CREATE TABLE "jobformsettings" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "formtype" VARCHAR(20) NOT NULL,
    "fieldsjson" TEXT NOT NULL,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "jobformsettings_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX "uq_jobformsettings_tenant_branch_formtype" ON "jobformsettings"("tenantid", "branchid", "formtype");
CREATE INDEX "idx_jobformsettings_tenant_branch" ON "jobformsettings"("tenantid", "branchid");

ALTER TABLE "jobformsettings" ADD CONSTRAINT "fk_jobformsettings_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobformsettings" ADD CONSTRAINT "fk_jobformsettings_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;
