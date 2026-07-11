export const EMAIL_TYPES = [
  'professional_request',
  'job_application',
  'leave_request',
  'complaint',
  'follow_up',
  'meeting_request',
  'information_request',
  'thank_you',
  'apology',
  'reminder',
  'personal',
  'other',
] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];

export const EMAIL_ANALYSIS_PROMPT_VERSION = 'v2.0.0';
export const EMAIL_GENERATION_PROMPT_VERSION = 'v2.0.0';

export interface EmailIntentAnalysis {
  sourceLanguage: string;
  outputLanguage: string;
  outputLanguageSource: 'explicit_request' | 'user_preference' | 'detected_language' | 'fallback';
  emailType: EmailType;
  mainIntent: string;
  recipient: {
    name: string | null;
    role: string | null;
    organization: string | null;
    relationship: string;
  };
  sender: { name: string | null; role: string | null; organization: string | null };
  tone: string;
  requestedLength: 'very_short' | 'short' | 'medium' | 'detailed';
  subjectGoal: string;
  facts: string[];
  dates: string[];
  amounts: string[];
  locations: string[];
  actionRequested: string | null;
  deadline: string | null;
  attachmentsMentioned: string[];
  constraints: string[];
  sensitiveDetails: string[];
  ambiguousDetails: string[];
  missingCriticalInformation: string[];
  mustNotInvent: string[];
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
  warnings: string[];
  missingInformation: string[];
  metadata: {
    model: string;
    deepgramModel: string;
    groqPrimaryModel: string;
    actualGroqModelUsed: string;
    fallbackUsed: boolean;
    analysisDurationMs: number;
    generationDurationMs: number;
    totalDurationMs: number;
    analysisPromptVersion: string;
    generationPromptVersion: string;
  };
  speechLanguageMode?: string;
  detectedSpeechLanguage?: string;
  requestedOutputLanguage?: string;
  effectiveOutputLanguage?: string;
  speechConfidence?: number | null;
  timings: { generationMs: number; validationMs: number; totalMs: number };
}

export interface GroqMessage {
  role: 'system' | 'user';
  content: string;
}
