-- Align branches.branchid sequence with existing rows (fixes org signup unique constraint on branchid).

SELECT setval(
  pg_get_serial_sequence('branches', 'branchid'),
  COALESCE((SELECT MAX(branchid) FROM branches), 0) + 1,
  false
);
