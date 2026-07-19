import { generationPromptV1 } from '../prompts/registry';
import { EmailGenerationInput } from './email-ai-provider.types';

export const EMAIL_PROVIDER_SYSTEM_PROMPT = `${generationPromptV1}

MULTI-PROVIDER OUTPUT CONTRACT (this replaces the output shape stated above):
Return exactly one JSON object with these keys and no others:
{"subject":"string","body":"string","detectedLanguage":"fr","detectedRecipientType":"string","detectedRelationship":"string","detectedTone":"professional","emailIntent":"string","emailComplexity":"simple","confidence":0.98,"validationWarnings":[]}
Never return Markdown, commentary, or code fences. validationWarnings must be an array of short strings and must be empty when there is no warning.`;

export function emailProviderUserInput(input: EmailGenerationInput) {
  return JSON.stringify({
    transcript: input.transcript,
    extraction: input.extraction,
    tone: input.tone,
    language: input.language,
    previousEmail: input.previousEmail,
  });
}
