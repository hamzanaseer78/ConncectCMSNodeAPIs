CREATE TABLE "userlocations" (
    "recno" SERIAL NOT NULL,
    "userid" INTEGER NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "recordedat" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdat" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "userlocations_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_userlocations_tenant_branch_time" ON "userlocations" ("tenantid", "branchid", "recordedat");
CREATE INDEX "idx_userlocations_user_time" ON "userlocations" ("userid", "recordedat");

ALTER TABLE "userlocations" ADD CONSTRAINT "fk_userlocations_user" FOREIGN KEY ("userid") REFERENCES "users" ("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "userlocations" ADD CONSTRAINT "fk_userlocations_tenant" FOREIGN KEY ("tenantid") REFERENCES "organizations" ("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "userlocations" ADD CONSTRAINT "fk_userlocations_branch" FOREIGN KEY ("branchid") REFERENCES "branches" ("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;
