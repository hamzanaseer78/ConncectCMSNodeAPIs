-- Customer phone (contactno) must be unique within tenant + branch when provided.

-- Clear duplicate phones (keep the oldest customer per tenant + branch + contactno).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.customerid
    FROM customers c
    WHERE c.tenantid IS NOT NULL
      AND c.branchid IS NOT NULL
      AND c.contactno IS NOT NULL
      AND TRIM(c.contactno) <> ''
      AND EXISTS (
        SELECT 1
        FROM customers c2
        WHERE c2.tenantid = c.tenantid
          AND c2.branchid = c.branchid
          AND c2.contactno = c.contactno
          AND c2.customerid <> c.customerid
      )
      AND c.customerid <> (
        SELECT MIN(c3.customerid)
        FROM customers c3
        WHERE c3.tenantid = c.tenantid
          AND c3.branchid = c.branchid
          AND c3.contactno = c.contactno
      )
  LOOP
    UPDATE customers
    SET contactno = NULL
    WHERE customerid = r.customerid;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_customers_tenant_branch_contactno"
  ON "customers" ("tenantid", "branchid", "contactno")
  WHERE "tenantid" IS NOT NULL
    AND "branchid" IS NOT NULL
    AND "contactno" IS NOT NULL
    AND TRIM("contactno") <> '';
