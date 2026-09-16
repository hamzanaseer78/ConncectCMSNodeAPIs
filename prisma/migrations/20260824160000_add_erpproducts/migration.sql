CREATE TABLE "erpproducts" (
    "erpproductid" SERIAL NOT NULL,
    "tenantid" INTEGER,
    "branchid" INTEGER,
    "unitid" INTEGER,
    "brandid" INTEGER,
    "name" TEXT,
    "hscode" VARCHAR(20),
    "barcode" VARCHAR(50),
    "erpcode" VARCHAR(50),
    "salerate" DOUBLE PRECISION,
    "discountvalue" DOUBLE PRECISION,
    "discounttype" TEXT,
    "purchaserate" DOUBLE PRECISION,
    "isactive" BOOLEAN,
    "enablecpairreceive" BOOLEAN DEFAULT false,
    "producttype" VARCHAR(20),
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "erpproducts_pkey" PRIMARY KEY ("erpproductid")
);

CREATE INDEX "idx_jsl_erpproducts" ON "erpproducts"("erpproductid");

ALTER TABLE "erpproducts" ADD CONSTRAINT "fk_jsl_erpproducts_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "erpproducts" ADD CONSTRAINT "fk_jsl_erpproducts_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "erpproducts" ADD CONSTRAINT "fk_jsl_erpproducts_unit"
    FOREIGN KEY ("unitid") REFERENCES "units"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "erpproducts" ADD CONSTRAINT "fk_jsl_erpproducts_brand"
    FOREIGN KEY ("brandid") REFERENCES "brands"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "erpproducts" ADD CONSTRAINT "fk_jsl_erpproducts_createdby"
    FOREIGN KEY ("createdby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "erpproducts" ADD CONSTRAINT "fk_jsl_erpproducts_lastupdatedby"
    FOREIGN KEY ("lastupdatedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
