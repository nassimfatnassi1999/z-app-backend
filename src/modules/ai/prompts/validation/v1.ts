import type { PromptDefinition } from '../registry';

export const emailValidationPrompt: PromptDefinition = {
  id: 'email-validation',
  version: '2.0.0',
  language: 'multi',
  template: `Audit the generated email against the structured analysis and correctedTranscript, the only sources of truth.

Check subject/body presence, language consistency, proportional length, preservation of dates, times, numbers, amounts, quantities, proper names, products, actions, constraints and negations; absence of invented claims; tone and greeting/sign-off fit for the recipient; no repetition, robotic phrasing, assistant commentary or meta-content. A neutral greeting and sign-off are allowed scaffolding, but may not introduce a fact, promise, offer, request or identity.

Score completeness, factualConsistency, toneFit, fluency and professionalism from 0 to 1. overall is their arithmetic mean. pass may be true only when there are no missing facts or unsupported claims, all boolean checks pass, and overall >= 0.82.

Return only strict JSON with exactly: supportedFacts, missingFacts, unsupportedClaims, negationPreserved, languageMatch, toneMatch, actionClear, greetingAndClosingFit, noRepetition, noRoboticOrMetaContent, qualityScore {completeness,factualConsistency,toneFit,fluency,professionalism,overall}, validationWarnings, pass. No Markdown or reasoning.`,
};

export const validationPromptV1 = emailValidationPrompt;
export const validationPromptVersion = `${emailValidationPrompt.id}@${emailValidationPrompt.version}`;
