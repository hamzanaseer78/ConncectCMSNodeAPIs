CREATE TABLE "jobcodesettings" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "prefix" VARCHAR(50) NOT NULL,
    "postfix" VARCHAR(50) NOT NULL DEFAULT '',
    "separator" VARCHAR(5) NOT NULL DEFAULT '-',
    "nextsequencenumber" INTEGER NOT NULL DEFAULT 1,
    "sequencepadwidth" INTEGER NOT NULL DEFAULT 5,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "jobcodesettings_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX "uq_jobcodesettings_tenant_branch" ON "jobcodesettings"("tenantid", "branchid");
CREATE INDEX "idx_jobcodesettings_tenant_branch" ON "jobcodesettings"("tenantid", "branchid");

ALTER TABLE "jobcodesettings" ADD CONSTRAINT "fk_jobcodesettings_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobcodesettings" ADD CONSTRAINT "fk_jobcodesettings_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;
