-- Job approval workflow: settings (up to 4 levels), approvers per level, requests & actions.

CREATE TABLE "jobapprovalsettings" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "isenabled" BOOLEAN NOT NULL DEFAULT false,
    "levelcount" INTEGER NOT NULL DEFAULT 1,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),
    CONSTRAINT "jobapprovalsettings_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX "uq_jobapprovalsettings_tenant_branch" ON "jobapprovalsettings"("tenantid", "branchid");
CREATE INDEX "idx_jobapprovalsettings_tenant_branch" ON "jobapprovalsettings"("tenantid", "branchid");

ALTER TABLE "jobapprovalsettings" ADD CONSTRAINT "fk_jobapprovalsettings_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "jobapprovalsettings" ADD CONSTRAINT "fk_jobapprovalsettings_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "jobapprovallevels" (
    "recno" SERIAL NOT NULL,
    "settingsid" INTEGER NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "levelno" INTEGER NOT NULL,
    "levelname" VARCHAR(100),
    "createdat" TIMESTAMP(6),
    CONSTRAINT "jobapprovallevels_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX "uq_jobapprovallevels_settings_level" ON "jobapprovallevels"("settingsid", "levelno");
CREATE INDEX "idx_jobapprovallevels_settings" ON "jobapprovallevels"("settingsid");

ALTER TABLE "jobapprovallevels" ADD CONSTRAINT "fk_jobapprovallevels_settings"
    FOREIGN KEY ("settingsid") REFERENCES "jobapprovalsettings"("recno") ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE TABLE "jobapprovallevelusers" (
    "recno" SERIAL NOT NULL,
    "levelid" INTEGER NOT NULL,
    "userid" INTEGER NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "createdat" TIMESTAMP(6),
    CONSTRAINT "jobapprovallevelusers_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX "uq_jobapprovallevelusers_level_user" ON "jobapprovallevelusers"("levelid", "userid");
CREATE INDEX "idx_jobapprovallevelusers_user" ON "jobapprovallevelusers"("userid");

ALTER TABLE "jobapprovallevelusers" ADD CONSTRAINT "fk_jobapprovallevelusers_level"
    FOREIGN KEY ("levelid") REFERENCES "jobapprovallevels"("recno") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "jobapprovallevelusers" ADD CONSTRAINT "fk_jobapprovallevelusers_user"
    FOREIGN KEY ("userid") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "jobapprovalrequests" (
    "recno" SERIAL NOT NULL,
    "jobid" INTEGER NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "currentlevel" INTEGER NOT NULL DEFAULT 1,
    "levelcount" INTEGER NOT NULL,
    "submittedby" INTEGER,
    "submittedat" TIMESTAMP(6),
    "completedat" TIMESTAMP(6),
    "rejectedby" INTEGER,
    "rejectedat" TIMESTAMP(6),
    "rejectremarks" TEXT,
    CONSTRAINT "jobapprovalrequests_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_jobapprovalrequests_job" ON "jobapprovalrequests"("jobid");
CREATE INDEX "idx_jobapprovalrequests_tenant_branch_status" ON "jobapprovalrequests"("tenantid", "branchid", "status");

ALTER TABLE "jobapprovalrequests" ADD CONSTRAINT "fk_jobapprovalrequests_job"
    FOREIGN KEY ("jobid") REFERENCES "job"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "jobapprovalrequests" ADD CONSTRAINT "fk_jobapprovalrequests_submittedby"
    FOREIGN KEY ("submittedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "jobapprovalrequests" ADD CONSTRAINT "fk_jobapprovalrequests_rejectedby"
    FOREIGN KEY ("rejectedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "jobapprovalactions" (
    "recno" SERIAL NOT NULL,
    "requestid" INTEGER NOT NULL,
    "levelno" INTEGER NOT NULL,
    "levelname" VARCHAR(100),
    "userid" INTEGER NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "remarks" TEXT,
    "actedat" TIMESTAMP(6),
    CONSTRAINT "jobapprovalactions_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_jobapprovalactions_request" ON "jobapprovalactions"("requestid");

ALTER TABLE "jobapprovalactions" ADD CONSTRAINT "fk_jobapprovalactions_request"
    FOREIGN KEY ("requestid") REFERENCES "jobapprovalrequests"("recno") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "jobapprovalactions" ADD CONSTRAINT "fk_jobapprovalactions_user"
    FOREIGN KEY ("userid") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
