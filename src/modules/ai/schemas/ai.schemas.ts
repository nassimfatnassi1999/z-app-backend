import { z } from 'zod';

const shortText = z.string().trim().max(500);
const extractedList = (maximum: number) =>
  z.preprocess((value) => (value === null ? [] : value), z.array(shortText).max(maximum));
const extractedLabel = (fallback: string, maximum: number) =>
  z.preprocess(
    (value) => (value === null || value === '' ? fallback : value),
    z.string().trim().min(1).max(maximum),
  );

export const transcriptExtractionSchema = z
  .object({
    language: z.string().trim().min(2).max(12),
    intent: extractedLabel('rewrite', 80),
    recipient: z.string().trim().max(320).nullable(),
    facts: extractedList(50),
    constraints: extractedList(30),
    requestedActions: extractedList(20),
    dates: extractedList(20),
    amounts: extractedList(20),
    names: extractedList(30),
    keywords: extractedList(30),
    tone: extractedLabel('professional', 40),
    ambiguities: extractedList(10),
    needsClarification: z.boolean(),
    clarificationQuestions: extractedList(3),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.needsClarification && value.clarificationQuestions.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A clarification question is required',
      });
    }
  });

export const generatedEmailSchema = z
  .object({
    language: z.string().trim().min(2).max(12),
    subject: z.string().trim().min(2).max(160),
    recipient: z.string().trim().max(320),
    body: z.string().trim().min(10).max(50_000),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const emailValidationSchema = z
  .object({
    supportedFacts: z.boolean(),
    missingFacts: z.array(shortText).max(30),
    unsupportedClaims: z.array(shortText).max(30),
    negationPreserved: z.boolean(),
    languageMatch: z.boolean(),
    toneMatch: z.boolean(),
    actionClear: z.boolean(),
    pass: z.boolean(),
  })
  .strict();

export type TranscriptExtraction = z.infer<typeof transcriptExtractionSchema>;
export type GeneratedEmail = z.infer<typeof generatedEmailSchema>;
export type EmailValidation = z.infer<typeof emailValidationSchema>;
