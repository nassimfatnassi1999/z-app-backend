ALTER TABLE "Email"
  ADD COLUMN "senderDeleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recipientDeleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "senderPurged" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recipientPurged" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "senderStarred" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recipientStarred" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the previously shared state for both participants.
UPDATE "Email"
SET "senderDeleted" = "deleted",
    "recipientDeleted" = "deleted",
    "senderStarred" = "starred",
    "recipientStarred" = "starred";

ALTER TABLE "Conversation" ADD COLUMN "directKey" TEXT;
CREATE UNIQUE INDEX "Conversation_directKey_key" ON "Conversation"("directKey");

CREATE INDEX "Email_senderId_senderDeleted_createdAt_idx"
  ON "Email"("senderId", "senderDeleted", "createdAt");
CREATE INDEX "Email_recipientId_recipientDeleted_createdAt_idx"
  ON "Email"("recipientId", "recipientDeleted", "createdAt");
