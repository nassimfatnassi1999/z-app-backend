import { Injectable } from '@nestjs/common';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { EMAIL_TYPES, EmailIntentAnalysis, GroqMessage } from './ai.types';

@Injectable()
export class PromptBuilderService {
  analysis(
    rawTranscription: string,
    cleanedTranscription: string,
    dto: GenerateEmailDto,
  ): GroqMessage[] {
    return [
      {
        role: 'system',
        content: [
          'Tu es le moteur d’analyse sémantique de l’application Z. Tu ne rédiges jamais l’email.',
          'Extrais uniquement les informations présentes ou clairement déductibles. Ne transforme jamais une incertitude en fait et n’invente aucun nom, date, entreprise, poste, pièce jointe, numéro ou délai.',
          'Identifie intention, destinataire, langues, ton, longueur, noms, dates, montants, lieux, délais et action. Ignore hésitations et répétitions. Place les ambiguïtés et informations essentielles absentes dans les champs dédiés.',
          `emailType doit appartenir à: ${EMAIL_TYPES.join(', ')}. confidence est entre 0 et 1.`,
          'Retourne exclusivement un JSON strict avec: sourceLanguage, outputLanguage, outputLanguageSource, emailType, mainIntent, recipient{name,role,organization,relationship}, sender{name,role,organization}, tone, requestedLength, subjectGoal, facts, dates, amounts, locations, actionRequested, deadline, attachmentsMentioned, constraints, sensitiveDetails, ambiguousDetails, missingCriticalInformation, mustNotInvent, confidence.',
          'Exemples condensés: congé avec dates => leave_request et dates exactes; candidature sans entreprise => job_application et entreprise manquante; réclamation sans référence => complaint et référence manquante; français demandant English => sourceLanguage fr, outputLanguage en, outputLanguageSource explicit_request.',
          'Aucun Markdown ni commentaire hors JSON.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          rawTranscription,
          cleanedTranscription,
          preferences: this.context(dto),
        }),
      },
    ];
  }

  generation(
    rawTranscription: string,
    cleanedTranscription: string,
    analysis: EmailIntentAnalysis,
    dto: GenerateEmailDto,
    previousEmail?: unknown,
  ): GroqMessage[] {
    return [
      {
        role: 'system',
        content: [
          'Tu es le moteur de rédaction professionnelle de l’application Z.',
          'Utilise l’analyse structurée comme source principale de vérité et la transcription originale seulement pour vérifier le contexte. Respecte strictement langue, ton et longueur demandés.',
          'Conserve tous les détails utiles, supprime hésitations et répétitions, reformule naturellement sans recopier la transcription.',
          'N’invente jamais nom, date, entreprise, poste, numéro, adresse, événement, pièce jointe, promesse ou signature. Ne mentionne une pièce jointe que si attachmentsMentioned le permet. Une information manquante doit rester neutre.',
          'Crée un objet précis. Paragraphes courts, ouverture et politesse adaptées, sans formule générique inutile. Ne mentionne jamais IA, Groq, Deepgram, transcription ou application Z.',
          'Retourne exclusivement un JSON: {subject,body,language,tone,emailType,warnings,missingInformation}. Aucun Markdown.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          analysis,
          rawTranscription,
          cleanedTranscription,
          preferences: this.context(dto),
          previousEmail,
          instruction: dto.userInstruction,
        }),
      },
    ];
  }

  private context(dto: GenerateEmailDto) {
    return {
      detectedLanguage: dto.detectedSpeechLanguage || dto.language,
      requestedOutputLanguage: dto.effectiveOutputLanguage,
      requestedTone: dto.tone || 'auto',
      customTone: dto.customTone,
      requestedLength: dto.length || 'auto',
      recipientName: dto.recipientName,
      relationship: dto.relationship,
      emailType: dto.emailType,
      currentBody: dto.currentBody,
      template: dto.template || dto.templateKey,
    };
  }
}
