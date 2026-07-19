export interface PromptDefinition {
  id: string;
  version: string;
  language: 'multi';
  template: string;
}

export { emailAnalysisPrompt, extractionPromptV1, extractionPromptVersion } from './extraction/v1';
export {
  emailGenerationPrompt,
  generationPromptV1,
  generationPromptVersion,
} from './generation/v1';
export {
  emailValidationPrompt,
  validationPromptV1,
  validationPromptVersion,
} from './validation/v1';
export { emailRepairPrompt, repairPromptV1, repairPromptVersion } from './repair/v1';
