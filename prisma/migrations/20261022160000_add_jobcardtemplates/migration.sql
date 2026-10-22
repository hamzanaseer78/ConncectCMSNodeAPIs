CREATE TABLE "jobcardtemplates" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "documenttype" VARCHAR(40) NOT NULL,
    "schemaversion" INTEGER NOT NULL DEFAULT 1,
    "templatejson" TEXT NOT NULL,
    "isselected" BOOLEAN NOT NULL DEFAULT false,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "jobcardtemplates_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_jobcardtemplates_tenant_branch" ON "jobcardtemplates"("tenantid", "branchid");
CREATE INDEX "idx_jobcardtemplates_selected" ON "jobcardtemplates"("tenantid", "branchid", "isselected");

ALTER TABLE "jobcardtemplates" ADD CONSTRAINT "fk_jobcardtemplates_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobcardtemplates" ADD CONSTRAINT "fk_jobcardtemplates_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;
