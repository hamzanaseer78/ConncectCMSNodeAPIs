-- Store who filed / reported the complaint on the job row.

ALTER TABLE "job" ADD COLUMN "complaintby" VARCHAR(200);
