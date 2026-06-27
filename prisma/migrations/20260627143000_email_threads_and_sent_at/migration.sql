ALTER TABLE "Email"
ADD COLUMN "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "replyToEmailId" TEXT,
ADD COLUMN "threadId" TEXT;

CREATE INDEX "Email_threadId_createdAt_idx" ON "Email"("threadId", "createdAt");
CREATE INDEX "Email_replyToEmailId_idx" ON "Email"("replyToEmailId");

ALTER TABLE "Email" ADD CONSTRAINT "Email_replyToEmailId_fkey"
FOREIGN KEY ("replyToEmailId") REFERENCES "Email"("id") ON DELETE SET NULL ON UPDATE CASCADE;
