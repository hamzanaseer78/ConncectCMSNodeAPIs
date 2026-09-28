-- Backfill userorganizations for legacy users (run once after deploy on PostgreSQL).
-- Safe to re-run: skips rows that already exist for (userid, tenantid, branchid).
--
-- Order:
--   1) Create memberships from existing userpolicies (tenant + branch).
--   2) Users with users.createdtenantid but still no branch membership → all branches in that org.
--
-- Optional (step 3): comment in if you prefer ONE default branch per user instead of all branches.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) From userpolicies → userorganizations
-- ---------------------------------------------------------------------------
INSERT INTO userorganizations (userid, tenantid, branchid, isblocked, createdat)
SELECT DISTINCT
  up.userid,
  up.tenantid,
  up.branchid,
  FALSE,
  NOW()
FROM userpolicies up
WHERE up.userid IS NOT NULL
  AND up.tenantid IS NOT NULL
  AND up.branchid IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM userorganizations uo
    WHERE uo.userid = up.userid
      AND uo.tenantid = up.tenantid
      AND uo.branchid = up.branchid
  );

-- ---------------------------------------------------------------------------
-- 2) From users.createdtenantid → every branch in that organization
--    (only users who still have no membership with a branch id)
-- ---------------------------------------------------------------------------
INSERT INTO userorganizations (userid, tenantid, branchid, isblocked, createdat)
SELECT
  u.userid,
  b.tenantid,
  b.branchid,
  FALSE,
  NOW()
FROM users u
INNER JOIN branches b ON b.tenantid = u.createdtenantid
WHERE u.createdtenantid IS NOT NULL
  AND (u.isdeleted IS NULL OR u.isdeleted = FALSE)
  AND (u.isactive IS NULL OR u.isactive = TRUE)
  AND NOT EXISTS (
    SELECT 1
    FROM userorganizations uo
    WHERE uo.userid = u.userid
      AND uo.branchid IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM userorganizations uo
    WHERE uo.userid = u.userid
      AND uo.tenantid = b.tenantid
      AND uo.branchid = b.branchid
  );

-- ---------------------------------------------------------------------------
-- 3) OPTIONAL: single default branch only (smallest branchid per org)
--    Uncomment this block AND comment out step 2 above if you want one branch per user.
-- ---------------------------------------------------------------------------
/*
INSERT INTO userorganizations (userid, tenantid, branchid, isblocked, createdat)
SELECT
  u.userid,
  b.tenantid,
  b.branchid,
  FALSE,
  NOW()
FROM users u
INNER JOIN LATERAL (
  SELECT branchid, tenantid
  FROM branches
  WHERE tenantid = u.createdtenantid
  ORDER BY branchid ASC
  LIMIT 1
) b ON TRUE
WHERE u.createdtenantid IS NOT NULL
  AND (u.isdeleted IS NULL OR u.isdeleted = FALSE)
  AND NOT EXISTS (
    SELECT 1 FROM userorganizations uo
    WHERE uo.userid = u.userid AND uo.branchid IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM userorganizations uo
    WHERE uo.userid = u.userid
      AND uo.tenantid = b.tenantid
      AND uo.branchid = b.branchid
  );
*/

-- Keep serial in sync (matches app postgres-create helper)
SELECT setval(
  pg_get_serial_sequence('userorganizations', 'recno'),
  GREATEST(COALESCE((SELECT MAX(recno) FROM userorganizations), 1), 1)
);

COMMIT;

-- ---------------------------------------------------------------------------
-- Verify (run separately)
-- ---------------------------------------------------------------------------
-- Users still without any branch membership:
-- SELECT u.userid, u.email, u.name, u.createdtenantid
-- FROM users u
-- WHERE (u.isdeleted IS NULL OR u.isdeleted = FALSE)
--   AND NOT EXISTS (
--     SELECT 1 FROM userorganizations uo
--     WHERE uo.userid = u.userid AND uo.branchid IS NOT NULL
--       AND (uo.isblocked IS NULL OR uo.isblocked = FALSE)
--   );
