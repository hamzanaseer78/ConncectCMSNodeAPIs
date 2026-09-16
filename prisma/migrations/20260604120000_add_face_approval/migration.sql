-- Face approval: branch settings, per-user flags, and approval requests.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "allowfaceapprovalrequest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "faceattendanceenabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "faceapprovalsettings" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "isenabled" BOOLEAN NOT NULL DEFAULT false,
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),
    CONSTRAINT "faceapprovalsettings_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX "uq_faceapprovalsettings_tenant_branch" ON "faceapprovalsettings"("tenantid", "branchid");
CREATE INDEX "idx_faceapprovalsettings_tenant_branch" ON "faceapprovalsettings"("tenantid", "branchid");

ALTER TABLE "faceapprovalsettings" ADD CONSTRAINT "fk_faceapprovalsettings_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "faceapprovalsettings" ADD CONSTRAINT "fk_faceapprovalsettings_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "faceapprovalrequests" (
    "recno" SERIAL NOT NULL,
    "userid" INTEGER NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "requestimage" TEXT NOT NULL,
    "profileimagesnapshot" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "remarks" TEXT,
    "reviewremarks" TEXT,
    "submittedat" TIMESTAMP(6) NOT NULL,
    "reviewedat" TIMESTAMP(6),
    "reviewedby" INTEGER,
    "createdat" TIMESTAMP(6),
    CONSTRAINT "faceapprovalrequests_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_faceapprovalrequests_tenant_branch_status" ON "faceapprovalrequests"("tenantid", "branchid", "status");
CREATE INDEX "idx_faceapprovalrequests_userid" ON "faceapprovalrequests"("userid");
CREATE INDEX "idx_faceapprovalrequests_submittedat" ON "faceapprovalrequests"("submittedat" DESC);

ALTER TABLE "faceapprovalrequests" ADD CONSTRAINT "fk_faceapprovalrequests_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "faceapprovalrequests" ADD CONSTRAINT "fk_faceapprovalrequests_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "faceapprovalrequests" ADD CONSTRAINT "fk_faceapprovalrequests_user"
    FOREIGN KEY ("userid") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "faceapprovalrequests" ADD CONSTRAINT "fk_faceapprovalrequests_reviewedby"
    FOREIGN KEY ("reviewedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
