-- faceapprovalrequests.status was created as VARCHAR; Prisma expects FaceApprovalRequestStatus enum.

CREATE TYPE "FaceApprovalRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

ALTER TABLE "faceapprovalrequests" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "faceapprovalrequests"
  ALTER COLUMN "status" TYPE "FaceApprovalRequestStatus"
  USING ("status"::text::"FaceApprovalRequestStatus");

ALTER TABLE "faceapprovalrequests"
  ALTER COLUMN "status" SET DEFAULT 'pending'::"FaceApprovalRequestStatus";
