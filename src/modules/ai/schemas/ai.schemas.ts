import { z } from 'zod';

const shortText = z.string().trim().min(1).max(500);
const list = (maximum = 50) =>
  z.preprocess((value) => (value == null ? [] : value), z.array(shortText).max(maximum));

export const emailIntentSchema = z.enum([
  'request',
  'information',
  'apology',
  'cancellation',
  'complaint',
  'follow_up',
  'quotation',
  'order',
  'purchase',
  'sale',
  'leave_request',
  'meeting',
  'appointment',
  'support',
  'technical',
  'thank_you',
  'invitation',
  'reminder',
  'other',
]);

export const recipientTypeSchema = z.enum([
  'manager',
  'colleague',
  'friend',
  'client',
  'prospect',
  'supplier',
  'hr',
  'management',
  'teacher',
  'university',
  'administration',
  'partner',
  'team',
  'support',
  'unknown',
]);

export const relationshipSchema = z.enum([
  'very_formal',
  'formal',
  'professional',
  'business',
  'semi_formal',
  'friendly',
  'casual',
]);

export const toneSchema = z.enum([
  'professional',
  'respectful',
  'friendly',
  'warm',
  'neutral',
  'formal',
  'urgent',
  'empathetic',
  'apologetic',
  'grateful',
  'persuasive',
  'confident',
  'supportive',
]);

export const complexitySchema = z.enum(['short', 'medium', 'detailed']);

export const transcriptCorrectionSchema = z
  .object({
    original: z.string().trim().min(1).max(200),
    corrected: z.string().trim().min(1).max(200),
    confidence: z.number().min(0).max(1),
    reason: z.string().trim().min(1).max(300),
  })
  .strict();

export const emailIntentAnalysisSchema = z
  .object({
    detectedLanguage: z.string().trim().min(2).max(12),
    correctedTranscript: z.string().trim().min(3).max(20_000),
    emailIntent: emailIntentSchema,
    detectedRecipientType: recipientTypeSchema,
    detectedRelationship: relationshipSchema,
    detectedTone: toneSchema,
    emailComplexity: complexitySchema,
    recipient: z.string().trim().max(320).nullable(),
    keyFacts: list(),
    dates: list(20),
    times: list(20),
    amounts: list(20),
    quantities: list(20),
    people: list(30),
    products: list(30),
    actions: list(30),
    constraints: list(30),
    ambiguities: list(20),
    transcriptCorrections: z.array(transcriptCorrectionSchema).max(20),
  })
  .strict();

export const generatedEmailSchema = z
  .object({
    subject: z.string().trim().min(2).max(160),
    body: z.string().trim().min(10).max(50_000),
    detectedLanguage: z.string().trim().min(2).max(12),
    detectedRecipientType: recipientTypeSchema,
    detectedRelationship: relationshipSchema,
    detectedTone: toneSchema,
    emailIntent: emailIntentSchema,
    emailComplexity: complexitySchema,
    confidence: z.number().min(0).max(1),
    validationWarnings: z.array(shortText).max(30),
    // Kept for recipient prefill compatibility with existing mobile clients.
    recipient: z.string().trim().max(320),
  })
  .strict();

export const emailQualityScoreSchema = z
  .object({
    completeness: z.number().min(0).max(1),
    factualConsistency: z.number().min(0).max(1),
    toneFit: z.number().min(0).max(1),
    fluency: z.number().min(0).max(1),
    professionalism: z.number().min(0).max(1),
    overall: z.number().min(0).max(1),
  })
  .strict();

export const emailValidationSchema = z
  .object({
    supportedFacts: z.boolean(),
    missingFacts: list(30),
    unsupportedClaims: list(30),
    negationPreserved: z.boolean(),
    languageMatch: z.boolean(),
    toneMatch: z.boolean(),
    actionClear: z.boolean(),
    greetingAndClosingFit: z.boolean(),
    noRepetition: z.boolean(),
    noRoboticOrMetaContent: z.boolean(),
    qualityScore: emailQualityScoreSchema,
    validationWarnings: list(30),
    pass: z.boolean(),
  })
  .strict();

// Compatibility name for internal callers and the existing /extract route.
export const transcriptExtractionSchema = emailIntentAnalysisSchema;
export type EmailIntentAnalysis = z.infer<typeof emailIntentAnalysisSchema>;
export type TranscriptExtraction = EmailIntentAnalysis;
export type GeneratedEmail = z.infer<typeof generatedEmailSchema>;
export type EmailQualityScore = z.infer<typeof emailQualityScoreSchema>;
export type EmailValidation = z.infer<typeof emailValidationSchema>;
