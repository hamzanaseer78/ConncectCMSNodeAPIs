-- Job-level brand FK (brands.recno)
ALTER TABLE "job" ADD COLUMN IF NOT EXISTS "brandid" INTEGER;

ALTER TABLE "job" DROP CONSTRAINT IF EXISTS "fk_jsl_job_brand";
ALTER TABLE "job"
  ADD CONSTRAINT "fk_jsl_job_brand"
  FOREIGN KEY ("brandid") REFERENCES "brands"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "idx_jsl_job_brandid" ON "job"("brandid");
