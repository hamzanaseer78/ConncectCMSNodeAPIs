CREATE TABLE IF NOT EXISTS "organizationaiusage" (
  "recno" SERIAL NOT NULL,
  "tenantid" INTEGER NOT NULL,
  "userid" INTEGER NOT NULL,
  "askedat" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "organizationaiusage_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX IF NOT EXISTS "idx_organizationaiusage_tenant_askedat"
  ON "organizationaiusage" ("tenantid", "askedat");
