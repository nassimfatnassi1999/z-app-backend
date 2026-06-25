-- Z cleanup after the legacy Sona chat schema.
-- Legacy migration filenames are kept for production history, but this removes
-- chat/contact/media tables from fresh local databases and adds email drafts.

DROP TABLE IF EXISTS "MessageMedia" CASCADE;
DROP TABLE IF EXISTS "MessageReaction" CASCADE;
DROP TABLE IF EXISTS "ReadReceipt" CASCADE;
DROP TABLE IF EXISTS "Message" CASCADE;
DROP TABLE IF EXISTS "ConversationMember" CASCADE;
DROP TABLE IF EXISTS "Conversation" CASCADE;
DROP TABLE IF EXISTS "Contact" CASCADE;
DROP TABLE IF EXISTS "MediaFile" CASCADE;
DROP TABLE IF EXISTS "OtpVerification" CASCADE;
DROP TABLE IF EXISTS "PasswordResetToken" CASCADE;

DROP TYPE IF EXISTS "ConversationType" CASCADE;
DROP TYPE IF EXISTS "MemberRole" CASCADE;
DROP TYPE IF EXISTS "MessageType" CASCADE;
DROP TYPE IF EXISTS "MessageStatus" CASCADE;
DROP TYPE IF EXISTS "MediaType" CASCADE;

ALTER TABLE "User" DROP COLUMN IF EXISTS "phoneE164";
ALTER TABLE "User" DROP COLUMN IF EXISTS "phoneHash";
ALTER TABLE "User" DROP COLUMN IF EXISTS "phoneVerifiedAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "avatarUrl";
ALTER TABLE "User" DROP COLUMN IF EXISTS "avatarColor";
ALTER TABLE "User" DROP COLUMN IF EXISTS "bio";
ALTER TABLE "User" DROP COLUMN IF EXISTS "statusMessage";
ALTER TABLE "User" DROP COLUMN IF EXISTS "isOnline";
ALTER TABLE "User" DROP COLUMN IF EXISTS "lastSeen";
ALTER TABLE "User" DROP COLUMN IF EXISTS "privacyLastSeen";
ALTER TABLE "User" DROP COLUMN IF EXISTS "privacyOnlineStatus";
ALTER TABLE "User" DROP COLUMN IF EXISTS "twoFactorEnabled";
ALTER TABLE "User" DROP COLUMN IF EXISTS "twoFactorSecret";
ALTER TABLE "User" DROP COLUMN IF EXISTS "deletedAt";

ALTER TABLE "User" RENAME COLUMN "displayName" TO "name";
DROP INDEX IF EXISTS "User_username_key";
DROP INDEX IF EXISTS "User_username_idx";
ALTER TABLE "User" DROP COLUMN IF EXISTS "username";

CREATE TABLE "EmailDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipient" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "templateKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailDraft_userId_idx" ON "EmailDraft"("userId");
CREATE INDEX "EmailDraft_createdAt_idx" ON "EmailDraft"("createdAt");
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
