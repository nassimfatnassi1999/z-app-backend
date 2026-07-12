import { EmailIntentAnalysis, EmailSourceContext, GeneratedEmailResponse, ValidationIssue } from './ai.types';

export const EMAIL_AI_PROVIDER = Symbol('EMAIL_AI_PROVIDER');
export interface EmailAnalysisInput { rawTranscript: string; normalizedTranscript: string }
export interface EmailGenerationInput { sourceContext: EmailSourceContext }
export interface EmailRepairInput {
  sourceContext: EmailSourceContext;
  invalidDraft: GeneratedEmailResponse;
  blockingIssues: ValidationIssue[];
}
export interface AiRequestContext { requestId: string; correlationId: string }
export interface EmailAiProvider {
  analyze(input: EmailAnalysisInput, context: AiRequestContext): Promise<EmailIntentAnalysis>;
  generate(input: EmailGenerationInput, context: AiRequestContext): Promise<GeneratedEmailResponse>;
  repair(input: EmailRepairInput, context: AiRequestContext): Promise<GeneratedEmailResponse>;
}
