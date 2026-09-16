-- Align jobservices with productLines shape (productid → service catalog products only).

ALTER TABLE "jobservices" DROP CONSTRAINT IF EXISTS "fk_jsl_jobservices_service";

ALTER TABLE "jobservices" DROP COLUMN IF EXISTS "serviceid";
ALTER TABLE "jobservices" DROP COLUMN IF EXISTS "servicename";

ALTER TABLE "jobservices" ADD COLUMN IF NOT EXISTS "productid" INTEGER;
ALTER TABLE "jobservices" ADD COLUMN IF NOT EXISTS "modelno" VARCHAR(50);
ALTER TABLE "jobservices" ADD COLUMN IF NOT EXISTS "partno" VARCHAR(50);
ALTER TABLE "jobservices" ADD COLUMN IF NOT EXISTS "salerefrenceno" VARCHAR(50);
ALTER TABLE "jobservices" ADD COLUMN IF NOT EXISTS "isserviceitem" BOOLEAN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_jsl_jobservices_products'
  ) THEN
    ALTER TABLE "jobservices"
      ADD CONSTRAINT "fk_jsl_jobservices_products"
      FOREIGN KEY ("productid") REFERENCES "products"("productid")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;
