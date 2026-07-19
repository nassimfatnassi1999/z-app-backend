import { TranscriptExtraction } from '../schemas/ai.schemas';

export enum AiProviderName {
  GROQ = 'groq',
  GEMINI = 'gemini',
  OPENROUTER = 'openrouter',
}

export interface EmailGenerationInput {
  transcript: string;
  extraction: TranscriptExtraction;
  tone?: string;
  language?: string;
  previousEmail?: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  detectedLanguage: string;
  detectedRecipientType: string;
  detectedRelationship: string;
  detectedTone: string;
  emailIntent: string;
  emailComplexity: string;
  confidence: number;
  validationWarnings: string[];
}

export interface EmailAiProvider {
  readonly name: AiProviderName;
  readonly model: string;

  isConfigured(): boolean;

  generateEmail(input: EmailGenerationInput): Promise<GeneratedEmail>;
}

export interface ProviderHealthState {
  consecutiveFailures: number;
  circuitOpenUntil: number | null;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
}
