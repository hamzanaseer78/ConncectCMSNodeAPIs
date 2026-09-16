ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "taxtypeid" INTEGER;

ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "fk_jsl_products_taxtypeid";
ALTER TABLE "products" ADD CONSTRAINT "fk_jsl_products_taxtypeid"
  FOREIGN KEY ("taxtypeid") REFERENCES "taxtypes"("recno")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "idx_jsl_products_taxtypeid" ON "products"("taxtypeid");
