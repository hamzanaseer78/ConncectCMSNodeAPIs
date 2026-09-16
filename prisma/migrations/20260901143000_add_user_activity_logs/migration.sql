-- User activity audit log
CREATE TYPE "UserActivityAction" AS ENUM (
  'create',
  'update',
  'delete',
  'assign',
  'unassign',
  'status_change',
  'login',
  'logout',
  'password_changed',
  'settings_updated',
  'invite',
  'activate',
  'deactivate',
  'block',
  'unblock',
  'approve',
  'reject',
  'complete',
  'resolve',
  'submit',
  'upload',
  'other'
);

CREATE TABLE "useractivitylogs" (
  "recno" SERIAL NOT NULL,
  "tenantid" INTEGER NOT NULL,
  "branchid" INTEGER NOT NULL,
  "userid" INTEGER,
  "module" VARCHAR(80) NOT NULL,
  "entityname" VARCHAR(255),
  "entitycode" VARCHAR(100),
  "jobid" INTEGER,
  "entityid" INTEGER,
  "action" "UserActivityAction" NOT NULL,
  "summary" TEXT,
  "metadata" JSONB,
  "ipaddress" VARCHAR(100),
  "useragent" VARCHAR(500),
  "recordedat" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "useractivitylogs_pkey" PRIMARY KEY ("recno"),
  CONSTRAINT "fk_useractivitylogs_branch" FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_useractivitylogs_tenant" FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_useractivitylogs_user" FOREIGN KEY ("userid") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_useractivitylogs_job" FOREIGN KEY ("jobid") REFERENCES "job"("recno") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "idx_useractivitylogs_tenant_branch_time" ON "useractivitylogs"("tenantid", "branchid", "recordedat" DESC);
CREATE INDEX "idx_useractivitylogs_user_time" ON "useractivitylogs"("userid", "recordedat" DESC);
CREATE INDEX "idx_useractivitylogs_module_time" ON "useractivitylogs"("module", "recordedat" DESC);
CREATE INDEX "idx_useractivitylogs_job_time" ON "useractivitylogs"("jobid", "recordedat" DESC);
CREATE INDEX "idx_useractivitylogs_action_time" ON "useractivitylogs"("action", "recordedat" DESC);
