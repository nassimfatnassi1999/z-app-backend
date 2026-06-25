ALTER TABLE "EmailDraft" ADD COLUMN "deviceId" TEXT;
ALTER TABLE "EmailDraft" ALTER COLUMN "userId" DROP NOT NULL;
CREATE INDEX "EmailDraft_deviceId_idx" ON "EmailDraft"("deviceId");
