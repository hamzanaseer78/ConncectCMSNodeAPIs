-- Mark a tenant job status as the canonical "cancelled" status (like isfirststatus / iscompletedstatus).

ALTER TABLE "jobstatuses"
ADD COLUMN IF NOT EXISTS "iscancelledstatus" BOOLEAN;
