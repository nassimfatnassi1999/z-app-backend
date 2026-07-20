CREATE TABLE "EmailGeneration" (
  "id" TEXT NOT NULL,
  "generationId" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "userId" TEXT,
  "analysisPromptId" TEXT NOT NULL,
  "generationPromptId" TEXT NOT NULL,
  "repairPromptId" TEXT,
  "promptHash" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "fallbackModelUsed" TEXT,
  "temperature" DOUBLE PRECISION NOT NULL,
  "inputLanguage" TEXT,
  "outputLanguage" TEXT NOT NULL,
  "enrichmentLevel" TEXT NOT NULL,
  "tone" TEXT NOT NULL,
  "repairUsed" BOOLEAN NOT NULL DEFAULT false,
  "validationCodes" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailGeneration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailGeneration_generationId_key" ON "EmailGeneration"("generationId");
CREATE INDEX "EmailGeneration_userId_createdAt_idx" ON "EmailGeneration"("userId", "createdAt");
CREATE INDEX "EmailGeneration_correlationId_idx" ON "EmailGeneration"("correlationId");
CREATE INDEX "EmailGeneration_createdAt_idx" ON "EmailGeneration"("createdAt");
ALTER TABLE "EmailGeneration" ADD CONSTRAINT "EmailGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
