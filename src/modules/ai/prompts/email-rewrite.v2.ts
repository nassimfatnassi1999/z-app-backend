import { PromptDefinition } from './prompt-registry';
export const rewritePromptV2: PromptDefinition<Record<string, unknown>> = Object.freeze({
  id: 'email-rewrite.v2', version: '2.0.0', description: 'Apply a stable professional rewrite action.',
  build: (input) => ({
    system: 'Applique uniquement l’instruction structurée au brouillon explicitement édité. Préserve tous les faits et vérifie-les contre EmailSourceContext. Pour improveSubject, modifie uniquement subject; pour improveClosing, uniquement le dernier paragraphe et la formule; shorten conserve demande, faits et conclusion; expand explique seulement les faits existants. Retourne uniquement le JSON email structuré.',
    user: JSON.stringify(input),
  }),
});
