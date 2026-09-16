-- Tenant-scoped expense type lookup (e.g. travel, parts, lodging).

CREATE TABLE "expensetypes" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER,
    "name" TEXT,
    "isactive" BOOLEAN,
    "sort" INTEGER,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "expensetypes_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_jsl_expensetypes" ON "expensetypes"("recno");

ALTER TABLE "expensetypes" ADD CONSTRAINT "fk_jsl_expensetypes_tenant" FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "expensetypes" ADD CONSTRAINT "fk_jsl_expensetypes_createdby" FOREIGN KEY ("createdby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "expensetypes" ADD CONSTRAINT "fk_jsl_expensetypes_lastupdatedby" FOREIGN KEY ("lastupdatedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
