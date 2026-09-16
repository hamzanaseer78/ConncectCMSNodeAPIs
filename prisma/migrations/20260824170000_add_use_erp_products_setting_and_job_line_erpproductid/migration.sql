ALTER TABLE "jobquotationsettings"
ADD COLUMN IF NOT EXISTS "useerpproducts" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "jobproducts"
ADD COLUMN IF NOT EXISTS "erpproductid" INTEGER;

ALTER TABLE "jobproducts" DROP CONSTRAINT IF EXISTS "fk_jsl_jobproducts_erpproduct";
ALTER TABLE "jobproducts" ADD CONSTRAINT "fk_jsl_jobproducts_erpproduct"
    FOREIGN KEY ("erpproductid") REFERENCES "erpproducts"("erpproductid") ON DELETE NO ACTION ON UPDATE NO ACTION;
