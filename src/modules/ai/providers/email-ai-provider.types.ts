export enum AiProviderName {
  GROQ = 'groq',
  GEMINI = 'gemini',
  OPENROUTER = 'openrouter',
}

export interface EmailPreferences {
  language?: string;
  tone?: string;
  recipient?: string;
  formality?: string;
  length?: string;
}

export interface GeneratedEmailContent {
  subject: string;
  body: string;
  detectedLanguage: string;
  detectedTone: string;
  emailType: string;
  confidence: number;
}

export interface GeneratedEmail extends GeneratedEmailContent {
  provider: string;
  model: string;
  repaired: boolean;
}

export interface EmailGenerationInput {
  transcript: string;
  preferences?: EmailPreferences;
  previousEmail?: string;
  mode?: 'generation' | 'repair';
  invalidEmail?: GeneratedEmailContent;
  validationErrors?: string[];
}

export interface EmailAiProvider {
  readonly name: AiProviderName;
  readonly model: string;
  isConfigured(): boolean;
  generateEmail(input: EmailGenerationInput, signal?: AbortSignal): Promise<GeneratedEmailContent>;
}

export interface RoutedEmailResult {
  email: GeneratedEmailContent;
  provider: AiProviderName;
  model: string;
  attempts: number;
  fallbackReasons: string[];
}

export interface ProviderHealthState {
  consecutiveFailures: number;
  circuitOpenUntil: number | null;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
}
