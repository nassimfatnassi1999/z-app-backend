CREATE TABLE "Email" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "transcript" TEXT,
    "tone" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Email_senderId_createdAt_idx" ON "Email"("senderId", "createdAt");
CREATE INDEX "Email_recipientId_createdAt_idx" ON "Email"("recipientId", "createdAt");
CREATE INDEX "Email_recipientId_read_idx" ON "Email"("recipientId", "read");
CREATE INDEX "Email_senderId_deleted_idx" ON "Email"("senderId", "deleted");
CREATE INDEX "Email_recipientId_deleted_idx" ON "Email"("recipientId", "deleted");

ALTER TABLE "Email" ADD CONSTRAINT "Email_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Email" ADD CONSTRAINT "Email_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
