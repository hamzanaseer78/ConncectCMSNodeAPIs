-- Job code must be unique within an organization (tenant), not per branch.
-- Different tenants may reuse the same code (e.g. org A and org B both having 000001).

-- 1) Reassign duplicate codes within the same tenant (keep the oldest job per tenant+code).
DO $$
DECLARE
  r RECORD;
  next_num BIGINT;
  next_code TEXT;
BEGIN
  FOR r IN
    SELECT j.recno, j.tenantid
    FROM job j
    WHERE j.tenantid IS NOT NULL
      AND j.code IS NOT NULL
      AND TRIM(j.code) <> ''
      AND EXISTS (
        SELECT 1
        FROM job j2
        WHERE j2.tenantid = j.tenantid
          AND j2.code = j.code
          AND j2.recno <> j.recno
      )
      AND j.recno <> (
        SELECT MIN(j3.recno)
        FROM job j3
        WHERE j3.tenantid = j.tenantid
          AND j3.code = j.code
      )
    ORDER BY j.tenantid, j.code, j.recno
  LOOP
    SELECT COALESCE(
      MAX(
        CASE
          WHEN code ~ '^\d+$' THEN code::bigint
          ELSE 0
        END
      ),
      0
    ) + 1
    INTO next_num
    FROM job
    WHERE tenantid = r.tenantid
      AND code IS NOT NULL;

    next_code := LPAD(next_num::text, 6, '0');

    WHILE EXISTS (
      SELECT 1
      FROM job
      WHERE tenantid = r.tenantid
        AND code = next_code
        AND recno <> r.recno
    ) LOOP
      next_num := next_num + 1;
      next_code := LPAD(next_num::text, 6, '0');
    END LOOP;

    UPDATE job
    SET code = next_code
    WHERE recno = r.recno;
  END LOOP;
END $$;

-- 2) Enforce uniqueness at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_job_tenant_code"
    ON "job" ("tenantid", "code")
    WHERE "tenantid" IS NOT NULL AND "code" IS NOT NULL;
