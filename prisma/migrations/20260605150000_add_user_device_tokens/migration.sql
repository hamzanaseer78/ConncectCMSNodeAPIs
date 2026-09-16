-- FCM device tokens for push notifications (one row per device token).

CREATE TABLE "userdevicetokens" (
    "recno" SERIAL NOT NULL,
    "userid" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "platform" VARCHAR(20),
    "createdat" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedat" TIMESTAMP(6),

    CONSTRAINT "userdevicetokens_pkey" PRIMARY KEY ("recno")
);

CREATE UNIQUE INDEX "userdevicetokens_token_key" ON "userdevicetokens"("token");
CREATE INDEX "idx_userdevicetokens_user" ON "userdevicetokens"("userid");

ALTER TABLE "userdevicetokens" ADD CONSTRAINT "fk_userdevicetokens_user"
    FOREIGN KEY ("userid") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;
