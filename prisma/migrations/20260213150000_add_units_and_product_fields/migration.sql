-- Units lookup and product associations (unit + inventory/service type).

CREATE TABLE "units" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER,
    "name" TEXT,
    "symbol" VARCHAR(20),
    "isactive" BOOLEAN,
    "sort" INTEGER,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "units_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_jsl_units" ON "units"("recno");

ALTER TABLE "units" ADD CONSTRAINT "fk_jsl_units_tenant" FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "units" ADD CONSTRAINT "fk_jsl_units_createdby" FOREIGN KEY ("createdby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "units" ADD CONSTRAINT "fk_jsl_units_lastupdatedby" FOREIGN KEY ("lastupdatedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "products" ADD COLUMN "unitid" INTEGER;

ALTER TABLE "products" ADD COLUMN "producttype" VARCHAR(20);

ALTER TABLE "products" ADD CONSTRAINT "fk_jsl_products_unit" FOREIGN KEY ("unitid") REFERENCES "units"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Backfill producttype from legacy isservice flag.
UPDATE "products"
SET "producttype" = CASE WHEN "isservice" IS TRUE THEN 'service' ELSE 'inventory' END
WHERE "producttype" IS NULL;
