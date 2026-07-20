import { z } from 'zod';

export const generatedEmailContentSchema = z
  .object({
    subject: z.string().trim().min(2).max(160),
    body: z.string().trim().min(10).max(50_000),
    detectedLanguage: z.string().trim().min(2).max(35),
    detectedTone: z.string().trim().min(1).max(80),
    emailType: z.string().trim().min(1).max(120),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const generatedEmailSchema = generatedEmailContentSchema.extend({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  repaired: z.boolean(),
});

export type GeneratedEmailContent = z.infer<typeof generatedEmailContentSchema>;
export type GeneratedEmail = z.infer<typeof generatedEmailSchema>;
