import { z } from 'zod';

const shortText = z.string().trim().max(500);

export const transcriptExtractionSchema = z
  .object({
    language: z.string().trim().min(2).max(12),
    intent: z.string().trim().min(1).max(80),
    recipient: z.string().trim().max(320).nullable(),
    facts: z.array(shortText).max(50),
    constraints: z.array(shortText).max(30),
    requestedActions: z.array(shortText).max(20),
    dates: z.array(shortText).max(20),
    amounts: z.array(shortText).max(20),
    names: z.array(shortText).max(30),
    tone: z.string().trim().min(1).max(40),
    ambiguities: z.array(shortText).max(10),
    needsClarification: z.boolean(),
    clarificationQuestions: z.array(shortText).max(3),
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
    subject: z.string().trim().min(2).max(160),
    body: z.string().trim().min(10).max(50_000),
    language: z.string().trim().min(2).max(12),
    tone: z.string().trim().min(1).max(40),
    intent: z.string().trim().min(1).max(80),
    recipientSuggestion: z.string().trim().max(320).nullable(),
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
