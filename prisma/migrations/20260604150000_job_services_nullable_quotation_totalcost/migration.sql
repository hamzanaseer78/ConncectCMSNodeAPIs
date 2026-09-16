-- Nullable quotation status, job total cost, and job service lines.

ALTER TABLE "job" ALTER COLUMN "quotationstatus" DROP NOT NULL;
ALTER TABLE "job" ALTER COLUMN "quotationstatus" DROP DEFAULT;

ALTER TABLE "job" ADD COLUMN "totalcost" DOUBLE PRECISION;

CREATE TABLE "jobservices" (
    "recno" SERIAL NOT NULL,
    "jobid" INTEGER,
    "tenantid" INTEGER,
    "branchid" INTEGER,
    "productid" INTEGER,
    "modelno" VARCHAR(50),
    "partno" VARCHAR(50),
    "salerefrenceno" VARCHAR(50),
    "qty" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "totalamount" DOUBLE PRECISION,
    "discounttype" VARCHAR(1),
    "discountvalue" DOUBLE PRECISION,
    "discountamount" DOUBLE PRECISION,
    "exclusiveamount" DOUBLE PRECISION,
    "taxtypeid" INTEGER,
    "taxpercent" DOUBLE PRECISION,
    "taxamount" DOUBLE PRECISION,
    "inclusiveamount" DOUBLE PRECISION,
    "isserviceitem" BOOLEAN,
    "lineno" INTEGER,
    "remarks" TEXT,

    CONSTRAINT "jobservices_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_jsl_jobservices" ON "jobservices"("recno");
CREATE INDEX "idx_jsl_jobservices_job" ON "jobservices"("jobid", "lineno");

ALTER TABLE "jobservices" ADD CONSTRAINT "fk_jsl_jobservices_job" FOREIGN KEY ("jobid") REFERENCES "job"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "jobservices" ADD CONSTRAINT "fk_jsl_jobservices_tenant" FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "jobservices" ADD CONSTRAINT "fk_jsl_jobservices_branch" FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "jobservices" ADD CONSTRAINT "fk_jsl_jobservices_products" FOREIGN KEY ("productid") REFERENCES "products"("productid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "jobservices" ADD CONSTRAINT "fk_jsl_jobservices_taxtypeid" FOREIGN KEY ("taxtypeid") REFERENCES "taxtypes"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;
