-- Tenant-scoped delivery type lookup (job.deliverytype stores recno; no FK on job for legacy rows).

CREATE TABLE "deliverytypes" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER,
    "name" TEXT,
    "isactive" BOOLEAN,
    "sort" INTEGER,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "deliverytypes_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_jsl_deliverytypes" ON "deliverytypes"("recno");

ALTER TABLE "deliverytypes" ADD CONSTRAINT "fk_jsl_deliverytypes_tenant" FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "deliverytypes" ADD CONSTRAINT "fk_jsl_deliverytypes_createdby" FOREIGN KEY ("createdby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "deliverytypes" ADD CONSTRAINT "fk_jsl_deliverytypes_lastupdatedby" FOREIGN KEY ("lastupdatedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
