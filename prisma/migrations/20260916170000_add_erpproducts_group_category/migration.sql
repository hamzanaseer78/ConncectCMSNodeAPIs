ALTER TABLE "erpproducts" ADD COLUMN "groupid" INTEGER;
ALTER TABLE "erpproducts" ADD COLUMN "serviceid" INTEGER;

ALTER TABLE "erpproducts" ADD CONSTRAINT "fk_jsl_erpproducts_group"
    FOREIGN KEY ("groupid") REFERENCES "jobgroups"("groupid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "erpproducts" ADD CONSTRAINT "fk_jsl_erpproducts_category"
    FOREIGN KEY ("serviceid") REFERENCES "jobcategories"("categoryid") ON DELETE NO ACTION ON UPDATE NO ACTION;
