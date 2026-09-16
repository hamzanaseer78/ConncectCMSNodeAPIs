-- Additional customer addresses (default address remains on customers table).

CREATE TABLE "customeraddresses" (
    "recno" SERIAL NOT NULL,
    "customerid" INTEGER NOT NULL,
    "tenantid" INTEGER,
    "branchid" INTEGER,
    "country" INTEGER,
    "city" INTEGER,
    "area" INTEGER,
    "address" VARCHAR(255),
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "customeraddresses_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_customeraddresses_customer" ON "customeraddresses"("customerid");
CREATE INDEX "idx_customeraddresses_tenant_branch_customer" ON "customeraddresses"("tenantid", "branchid", "customerid");

ALTER TABLE "customeraddresses" ADD CONSTRAINT "fk_customeraddresses_customer"
    FOREIGN KEY ("customerid") REFERENCES "customers"("customerid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "customeraddresses" ADD CONSTRAINT "fk_customeraddresses_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "customeraddresses" ADD CONSTRAINT "fk_customeraddresses_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "customeraddresses" ADD CONSTRAINT "fk_customeraddresses_country"
    FOREIGN KEY ("country") REFERENCES "countries"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "customeraddresses" ADD CONSTRAINT "fk_customeraddresses_city"
    FOREIGN KEY ("city") REFERENCES "cities"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "customeraddresses" ADD CONSTRAINT "fk_customeraddresses_area"
    FOREIGN KEY ("area") REFERENCES "areas"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "customeraddresses" ADD CONSTRAINT "fk_customeraddresses_createdby"
    FOREIGN KEY ("createdby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "customeraddresses" ADD CONSTRAINT "fk_customeraddresses_lastupdatedby"
    FOREIGN KEY ("lastupdatedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
