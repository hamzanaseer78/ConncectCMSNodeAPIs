-- Quotation quoted-by user and quoted date on job and status log.

ALTER TABLE "job" ADD COLUMN "quotationquotedby" INTEGER;
ALTER TABLE "job" ADD COLUMN "quotationquotedat" TIMESTAMP(6);

ALTER TABLE "jobquotationstatuslog" ADD COLUMN "quotedby" INTEGER;
ALTER TABLE "jobquotationstatuslog" ADD COLUMN "quotedat" TIMESTAMP(6);

ALTER TABLE "job" ADD CONSTRAINT "fk_jsl_job_quotationquotedby"
    FOREIGN KEY ("quotationquotedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "jobquotationstatuslog" ADD CONSTRAINT "fk_jsl_jobquotationstatuslog_quotedby"
    FOREIGN KEY ("quotedby") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
