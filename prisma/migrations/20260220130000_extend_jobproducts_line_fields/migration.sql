-- Job product lines: inventory + service billing fields on jobproducts (single line table).

ALTER TABLE "jobproducts" ADD COLUMN IF NOT EXISTS "qty" DOUBLE PRECISION;
ALTER TABLE "jobproducts" ADD COLUMN IF NOT EXISTS "price" DOUBLE PRECISION;
ALTER TABLE "jobproducts" ADD COLUMN IF NOT EXISTS "totalamount" DOUBLE PRECISION;
ALTER TABLE "jobproducts" ADD COLUMN IF NOT EXISTS "discounttype" VARCHAR(1);
ALTER TABLE "jobproducts" ADD COLUMN IF NOT EXISTS "discountvalue" DOUBLE PRECISION;
ALTER TABLE "jobproducts" ADD COLUMN IF NOT EXISTS "discountamount" DOUBLE PRECISION;
ALTER TABLE "jobproducts" ADD COLUMN IF NOT EXISTS "exclusiveamount" DOUBLE PRECISION;
ALTER TABLE "jobproducts" ADD COLUMN IF NOT EXISTS "taxtypeid" INTEGER;
ALTER TABLE "jobproducts" ADD COLUMN IF NOT EXISTS "taxpercent" DOUBLE PRECISION;
ALTER TABLE "jobproducts" ADD COLUMN IF NOT EXISTS "taxamount" DOUBLE PRECISION;
ALTER TABLE "jobproducts" ADD COLUMN IF NOT EXISTS "inclusiveamount" DOUBLE PRECISION;
ALTER TABLE "jobproducts" ADD COLUMN IF NOT EXISTS "isserviceitem" BOOLEAN;

ALTER TABLE "jobproducts" DROP CONSTRAINT IF EXISTS "fk_jsl_jobproducts_taxtypeid";
ALTER TABLE "jobproducts" ADD CONSTRAINT "fk_jsl_jobproducts_taxtypeid"
    FOREIGN KEY ("taxtypeid") REFERENCES "taxtypes"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;
