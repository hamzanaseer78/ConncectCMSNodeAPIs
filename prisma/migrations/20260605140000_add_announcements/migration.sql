-- Admin announcements visible to technicians (and optional other audiences).

CREATE TYPE "AnnouncementAudience" AS ENUM ('all', 'technician', 'manager', 'admin');

CREATE TABLE "announcements" (
    "recno" SERIAL NOT NULL,
    "tenantid" INTEGER NOT NULL,
    "branchid" INTEGER,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'technician',
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "publishat" TIMESTAMP(6),
    "expireat" TIMESTAMP(6),
    "createdby" INTEGER,
    "createdat" TIMESTAMP(6),
    "lastupdatedby" INTEGER,
    "lastupdatedat" TIMESTAMP(6),

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("recno")
);

CREATE INDEX "idx_announcements_tenant_branch_active" ON "announcements"("tenantid", "branchid", "isactive");
CREATE INDEX "idx_announcements_publish_expire" ON "announcements"("publishat", "expireat");

ALTER TABLE "announcements" ADD CONSTRAINT "fk_announcements_tenant"
    FOREIGN KEY ("tenantid") REFERENCES "organizations"("tenantid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "announcements" ADD CONSTRAINT "fk_announcements_branch"
    FOREIGN KEY ("branchid") REFERENCES "branches"("branchid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "announcements" ADD CONSTRAINT "fk_announcements_createdby"
    FOREIGN KEY ("createdby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "announcements" ADD CONSTRAINT "fk_announcements_lastupdatedby"
    FOREIGN KEY ("lastupdatedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
