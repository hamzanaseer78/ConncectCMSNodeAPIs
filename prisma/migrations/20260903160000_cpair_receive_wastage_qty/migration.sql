-- Wastage qty recorded when admin receives c-pair from technician
ALTER TABLE "jobcpairreceivelog" ADD COLUMN IF NOT EXISTS "wastageqty" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "jobcpairparts" ADD COLUMN IF NOT EXISTS "linewastagereceived" INTEGER NOT NULL DEFAULT 0;
