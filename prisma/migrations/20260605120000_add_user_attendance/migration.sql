-- User check-in / check-out / break tracking with mandatory location.

CREATE TYPE "UserAttendanceStatus" AS ENUM ('checked_in', 'on_break', 'checked_out');
CREATE TYPE "UserAttendanceAction" AS ENUM ('check_in', 'check_out', 'break_in', 'break_out');

CREATE TABLE "userattendancesession" (
    "recno" SERIAL NOT NULL,
    "userid" INTEGER NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "status" "UserAttendanceStatus" NOT NULL DEFAULT 'checked_in',
    "isopen" BOOLEAN NOT NULL DEFAULT true,
    "checkinat" TIMESTAMP(6) NOT NULL,
    "checkoutat" TIMESTAMP(6),
    "lastlatitude" DOUBLE PRECISION NOT NULL,
    "lastlongitude" DOUBLE PRECISION NOT NULL,
    "lastaddress" TEXT NOT NULL,
    "lastactionat" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "userattendancesession_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX "userattendancesession_open_user_branch_key"
    ON "userattendancesession"("userid", "tenantid", "branchid")
    WHERE "isopen" = true;

CREATE INDEX "idx_userattendance_session_tenant_branch_open"
    ON "userattendancesession"("tenantid", "branchid", "isopen");

CREATE INDEX "idx_userattendance_session_user"
    ON "userattendancesession"("userid", "lastactionat" DESC);

CREATE TABLE "userattendancelog" (
    "recno" SERIAL NOT NULL,
    "sessionid" INTEGER NOT NULL,
    "userid" INTEGER NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "action" "UserAttendanceAction" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT NOT NULL,
    "recordedat" TIMESTAMP(6) NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "userattendancelog_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_userattendance_log_session" ON "userattendancelog"("sessionid", "recordedat");
CREATE INDEX "idx_userattendance_log_user" ON "userattendancelog"("userid", "recordedat" DESC);

ALTER TABLE "userattendancesession" ADD CONSTRAINT "fk_userattendance_session_user"
    FOREIGN KEY ("userid") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "userattendancesession" ADD CONSTRAINT "fk_userattendance_session_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "userattendancesession" ADD CONSTRAINT "fk_userattendance_session_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "userattendancelog" ADD CONSTRAINT "fk_userattendance_log_session"
    FOREIGN KEY ("sessionid") REFERENCES "userattendancesession"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "userattendancelog" ADD CONSTRAINT "fk_userattendance_log_user"
    FOREIGN KEY ("userid") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "userattendancelog" ADD CONSTRAINT "fk_userattendance_log_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "userattendancelog" ADD CONSTRAINT "fk_userattendance_log_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;
