-- Phone verification (OTP) — keep email+password auth, make phone trust explicit.
-- Renames phoneNumber → phoneE164 (data preserved) and drops its UNIQUE
-- constraint: an unverified phone is just a pending profile value. Uniqueness
-- now lives on phoneHash, which is only ever set by the OTP verify flow.

-- Rename the column to preserve existing values (they become unverified/pending)
ALTER TABLE "User" RENAME COLUMN "phoneNumber" TO "phoneE164";

-- Unverified phones are no longer unique
DROP INDEX "User_phoneNumber_key";
DROP INDEX "User_phoneNumber_idx";

-- Verified-phone columns
ALTER TABLE "User" ADD COLUMN "phoneHash" TEXT;
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_phoneHash_key" ON "User"("phoneHash");
CREATE INDEX "User_phoneHash_idx" ON "User"("phoneHash");

-- OTP verifications (raw code never stored — bcrypt hash only)
CREATE TABLE "OtpVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'phone_verification',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OtpVerification_userId_phoneE164_createdAt_idx" ON "OtpVerification"("userId", "phoneE164", "createdAt");
CREATE INDEX "OtpVerification_expiresAt_idx" ON "OtpVerification"("expiresAt");

ALTER TABLE "OtpVerification" ADD CONSTRAINT "OtpVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
