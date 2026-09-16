-- User role category on users table: admin, manager, technician
CREATE TYPE "UserType" AS ENUM ('admin', 'manager', 'technician');

ALTER TABLE "users" ADD COLUMN "usertype" "UserType";
