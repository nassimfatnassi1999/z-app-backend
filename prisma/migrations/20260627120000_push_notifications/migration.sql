CREATE TABLE "DevicePushToken" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "appVersion" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DevicePushToken_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "newEmails" BOOLEAN NOT NULL DEFAULT true, "sound" BOOLEAN NOT NULL DEFAULT true,
    "vibration" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DevicePushToken_token_key" ON "DevicePushToken"("token");
CREATE INDEX "DevicePushToken_userId_revokedAt_idx" ON "DevicePushToken"("userId", "revokedAt");
CREATE INDEX "DevicePushToken_userId_deviceId_idx" ON "DevicePushToken"("userId", "deviceId");
CREATE UNIQUE INDEX "NotificationSettings_userId_key" ON "NotificationSettings"("userId");
ALTER TABLE "DevicePushToken" ADD CONSTRAINT "DevicePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
