-- Product identification codes for ERP and trade compliance.

ALTER TABLE "products" ADD COLUMN "hscode" VARCHAR(20);
ALTER TABLE "products" ADD COLUMN "barcode" VARCHAR(50);
ALTER TABLE "products" ADD COLUMN "erpcode" VARCHAR(50);
