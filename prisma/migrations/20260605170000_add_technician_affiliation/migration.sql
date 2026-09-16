-- Technician in-house vs third-party affiliation and external company name.

CREATE TYPE "TechnicianAffiliation" AS ENUM ('in_house', 'third_party');

ALTER TABLE "users" ADD COLUMN "technicianaffiliation" "TechnicianAffiliation";
ALTER TABLE "users" ADD COLUMN "companyname" VARCHAR(100);
