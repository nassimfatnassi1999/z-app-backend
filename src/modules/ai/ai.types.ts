export const EMAIL_TYPES = [
  'request',
  'complaint',
  'follow_up',
  'reminder',
  'thanks',
  'invitation',
  'report',
  'confirmation',
  'cancellation',
  'apology',
  'support',
  'sales',
  'invoice',
  'hr',
  'internship',
  'recruitment',
  'university',
  'client',
  'prospecting',
  'other',
] as const;

export type EmailType = (typeof EMAIL_TYPES)[number];

export interface TranscriptAnalysis {
  language: string;
  intent: string;
  emailType: EmailType;
  recipient: string;
  requestedAction: string;
  people: string[];
  company: string;
  dates: string[];
  times: string[];
  amounts: string[];
  places: string[];
  references: string[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  detectedTone: string;
  formality: 'informal' | 'neutral' | 'formal';
  importantInformation: string[];
  confidence: number;
}

export interface GeneratedEmailResponse {
  language: string;
  tone: string;
  intent: string;
  subject: string;
  body: string;
  suggestedRecipient: string;
  confidence: number;
  emailType: EmailType;
  detectedTone: string;
  detectedLanguage: string;
  generationConfidence: number;
  validationScore: number;
  requestId: string;
  timings: { generationMs: number; validationMs: number; totalMs: number };
}

export interface GroqMessage {
  role: 'system' | 'user';
  content: string;
}
