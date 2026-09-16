ALTER TABLE "job"
ADD COLUMN IF NOT EXISTS "erpproductid" INTEGER;

UPDATE "job" j
SET "erpproductid" = sub."erpproductid"
FROM (
    SELECT DISTINCT ON ("jobid") "jobid", "erpproductid"
    FROM "jobproducts"
    WHERE "erpproductid" IS NOT NULL
    ORDER BY "jobid", "lineno" ASC NULLS LAST, "recno" ASC
) sub
WHERE j."recno" = sub."jobid"
  AND j."erpproductid" IS NULL;

ALTER TABLE "jobproducts" DROP CONSTRAINT IF EXISTS "fk_jsl_jobproducts_erpproduct";
ALTER TABLE "jobproducts" DROP COLUMN IF EXISTS "erpproductid";

ALTER TABLE "job" DROP CONSTRAINT IF EXISTS "fk_jsl_job_erpproduct";
ALTER TABLE "job" ADD CONSTRAINT "fk_jsl_job_erpproduct"
    FOREIGN KEY ("erpproductid") REFERENCES "erpproducts"("erpproductid") ON DELETE NO ACTION ON UPDATE NO ACTION;
