-- Add street/location text on customers (country/city/area remain FK ids).
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "address" VARCHAR(255);
