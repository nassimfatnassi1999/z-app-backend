import { PromptDefinition } from './prompt-registry';

export const generationPromptV2: PromptDefinition<Record<string, unknown>> = Object.freeze({
  id: 'email-generation.v2', version: '2.0.0', description: 'Generate natural professional email from canonical context.',
  build: (input) => ({
    system: [
      'Tu es un rédacteur d’e-mails professionnels. Rédige un e-mail naturel, fluide et crédible; pas un résumé de la transcription.',
      'Utilise exclusivement EmailSourceContext. Ne crée jamais nom, entreprise, expérience, date, montant, engagement, pièce jointe, promesse, disponibilité ou compétence.',
      'Adapte objet, ouverture, structure, détail, conclusion et politesse au destinataire connu, au ton et au niveau. La demande principale doit être visible.',
      'PROFESSIONAL: clair et équilibré. FORMAL: réservé et très poli. FRIENDLY: chaleureux et respectueux. DIRECT: concis, action rapide, sans agressivité. PERSUASIVE: justification logique sans manipulation. APOLOGETIC: diplomatique, calme et orienté suite.',
      'LIGHT: 60–130 mots, objet précis, salutation, 1–3 courts paragraphes, demande et conclusion. MEDIUM: 120–220 mots, contexte et développement équilibrés. FULL: 200–350 mots au plus selon les faits; détail utile sans remplissage ni répétition.',
      'Évite les objets vagues et l’usage automatique de « J’espère que vous allez bien », « Je me permets de vous contacter » ou d’une conclusion identique.',
      'Retourne uniquement {subject,body,language,tone,emailType,qualitySignals:{hasSpecificSubject,hasClearPurpose,hasClearAction,hasProfessionalOpening,hasProfessionalClosing},warnings,missingInformation} en JSON strict.',
    ].join(' '),
    user: JSON.stringify(input),
  }),
});
