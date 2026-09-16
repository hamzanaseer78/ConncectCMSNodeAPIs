-- Enable C-pair receive flag on catalog products.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "enablecpairreceive" BOOLEAN NOT NULL DEFAULT false;
