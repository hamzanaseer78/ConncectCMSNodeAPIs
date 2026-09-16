-- Per-user report column chooser preferences stored as JSON.

CREATE TABLE IF NOT EXISTS "reportcolumnpreferences" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "userid" INTEGER NOT NULL,
    "reportkey" VARCHAR(100) NOT NULL,
    "columnsjson" TEXT NOT NULL,
    "createdat" TIMESTAMP(6),
    "lastupdatedat" TIMESTAMP(6),
    CONSTRAINT "reportcolumnpreferences_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_reportcolumnprefs_scope"
    ON "reportcolumnpreferences" ("tenantid", "branchid", "userid", "reportkey");

CREATE INDEX IF NOT EXISTS "idx_reportcolumnprefs_user"
    ON "reportcolumnpreferences" ("tenantid", "branchid", "userid");

ALTER TABLE "reportcolumnpreferences"
    ADD CONSTRAINT "fk_reportcolumnprefs_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches"("branchid")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "reportcolumnpreferences"
    ADD CONSTRAINT "fk_reportcolumnprefs_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "reportcolumnpreferences"
    ADD CONSTRAINT "fk_reportcolumnprefs_user"
    FOREIGN KEY ("userid") REFERENCES "users"("userid")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
