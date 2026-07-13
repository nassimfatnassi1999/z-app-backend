import { PromptDefinition } from './prompt-registry';
export const repairPromptV2: PromptDefinition<Record<string, unknown>> = Object.freeze({
  id: 'email-repair.v2', version: '2.0.0', description: 'Repair blocking v2 failures once.',
  build: (input) => ({
    system: 'Répare uniquement les erreurs bloquantes listées en conservant les faits, la langue, le ton et le niveau du contexte canonique. N’ajoute rien et ne traite pas les warnings stylistiques comme des erreurs. Retourne uniquement le JSON email structuré.',
    user: JSON.stringify(input),
  }),
});
