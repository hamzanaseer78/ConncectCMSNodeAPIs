-- Brands lookup and product association.

CREATE TABLE "brands" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER,
    "name" TEXT,
    "isactive" BOOLEAN,
    "sort" INTEGER,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "brands_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_jsl_brands" ON "brands"("recno");

ALTER TABLE "brands" ADD CONSTRAINT "fk_jsl_brands_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "brands" ADD CONSTRAINT "fk_jsl_brands_createdby"
    FOREIGN KEY ("createdby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "brands" ADD CONSTRAINT "fk_jsl_brands_lastupdatedby"
    FOREIGN KEY ("lastupdatedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brandid" INTEGER;

ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "fk_jsl_products_brand";
ALTER TABLE "products" ADD CONSTRAINT "fk_jsl_products_brand"
    FOREIGN KEY ("brandid") REFERENCES "brands"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;
