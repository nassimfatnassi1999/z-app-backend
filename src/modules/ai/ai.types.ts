export const supportedEmailLanguages = [
  'fr',
  'en',
  'ar',
  'de',
  'es',
  'it',
  'pt',
  'nl',
  'tr',
] as const;

export type SupportedEmailLanguage = (typeof supportedEmailLanguages)[number];
export type EmailLanguageSelection = SupportedEmailLanguage | 'auto' | 'unknown';

export enum EmailPurpose {
  Meeting = 'meeting',
  Complaint = 'complaint',
  JobApplication = 'job_application',
  Internship = 'internship',
  FollowUp = 'follow_up',
  Invoice = 'invoice',
  Quotation = 'quotation',
  SupportRequest = 'support_request',
  Cancellation = 'cancellation',
  ThankYou = 'thank_you',
  Reminder = 'reminder',
  Request = 'request',
  Invitation = 'invitation',
  Proposal = 'proposal',
  Interview = 'interview_request',
  General = 'general',
}

export enum EmailTone {
  Formal = 'formal',
  SemiFormal = 'semi_formal',
  Friendly = 'friendly',
  Executive = 'executive',
  Administrative = 'administrative',
  Academic = 'academic',
  Legal = 'legal',
  Medical = 'medical',
  Hr = 'hr',
  Sales = 'sales',
  CustomerSupport = 'customer_support',
  Internship = 'internship',
  Student = 'student',
  Professor = 'professor',
  Research = 'research',
  Technical = 'technical',
  Marketing = 'marketing',
  Apologetic = 'apologetic',
  Persuasive = 'persuasive',
  Negotiation = 'negotiation',
  Complaint = 'complaint',
  FollowUp = 'follow_up',
  Reminder = 'reminder',
  Urgent = 'urgent',
  Luxury = 'luxury',
  Minimalist = 'minimalist',
  Professional = 'professional',
  Business = 'business',
}

export type ExtractedEntities = {
  recipient?: string;
  recipients: string[];
  company?: string;
  person?: string;
  date?: string;
  dateText?: string;
  time?: string;
  location?: string;
  meetingType?: string;
  project?: string;
  urgency?: string;
  deadline?: string;
  tone?: EmailTone;
  language?: SupportedEmailLanguage;
  customInstructions?: string[];
};

export type LanguageAnalysis = {
  transcriptLanguage: EmailLanguageSelection;
  requestedOutputLanguage: EmailLanguageSelection;
  outputLanguage: SupportedEmailLanguage;
  confidence: number;
};

export type TranscriptAnalysis = {
  transcript: string;
  cleanedTranscript: string;
  isMixedLanguage: boolean;
  injectionRisk: boolean;
  customInstructions: string[];
};

export type IntentAnalysis = {
  purpose: EmailPurpose;
  confidence: number;
  summary: string;
};

export type EmailPlan = {
  goal: string;
  recipient?: string;
  language: SupportedEmailLanguage;
  tone: EmailTone;
  subjectHint: string;
  sections: string[];
  entities: ExtractedEntities;
  intent: IntentAnalysis;
  transcriptLanguage: EmailLanguageSelection;
};

export type PromptMessages = {
  system: string;
  developer: string;
  user: string;
};

export type GeneratedEmailResponse = {
  subject: string;
  body: string;
  language: SupportedEmailLanguage;
  outputLanguage: SupportedEmailLanguage;
  purpose: EmailPurpose | string;
  recipient?: string;
  detectedLanguage: EmailLanguageSelection;
  confidence: number;
  extractedEntities: ExtractedEntities;
  suggestedRecipient: string;
  tone: EmailTone | string;
  intent: EmailPurpose | string;
  provider?: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  confidencePenalty: number;
};

export type PipelineContext = {
  transcript: string;
  selectedOutputLanguage?: string;
  selectedTone?: string;
  customTone?: string;
  template?: string;
  transcriptLanguage?: string;
};
