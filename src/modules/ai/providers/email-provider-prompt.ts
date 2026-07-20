import {
  buildGenerationUserPrompt,
  EMAIL_GENERATION_SYSTEM_PROMPT,
} from '../prompts/email-generation.prompt';
import { buildRepairUserPrompt, EMAIL_REPAIR_SYSTEM_PROMPT } from '../prompts/email-repair.prompt';
import { EmailGenerationInput } from './email-ai-provider.types';

export function emailProviderPrompt(input: EmailGenerationInput) {
  return input.mode === 'repair'
    ? { system: EMAIL_REPAIR_SYSTEM_PROMPT, user: buildRepairUserPrompt(input) }
    : { system: EMAIL_GENERATION_SYSTEM_PROMPT, user: buildGenerationUserPrompt(input) };
}
