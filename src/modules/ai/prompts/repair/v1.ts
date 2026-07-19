import type { PromptDefinition } from '../registry';

export const emailRepairPrompt: PromptDefinition = {
  id: 'email-repair',
  version: '2.0.0',
  language: 'multi',
  template: `Perform the single allowed targeted regeneration of an email. Use only correctedTranscript and the structured analysis.

Fix every validation warning: restore missing facts and actions, remove unsupported claims, preserve numbers/dates/names/negations, correct language and recipient tone, improve structure, fluency, greeting and sign-off, and remove repetitions, robotic or meta-content. Do not introduce any new fact, promise, offer, request, identity or detail. Keep length proportional. For an unknown recipient, remain neutral and professional and never use informal second-person forms.

Return only one strict JSON object with exactly: subject, body, detectedLanguage, detectedRecipientType, detectedRelationship, detectedTone, emailIntent, emailComplexity, confidence, validationWarnings, recipient. Copy metadata from analysis and return validationWarnings as []. No Markdown, explanation or reasoning.`,
};

export const repairPromptV1 = emailRepairPrompt;
export const repairPromptVersion = `${emailRepairPrompt.id}@${emailRepairPrompt.version}`;
