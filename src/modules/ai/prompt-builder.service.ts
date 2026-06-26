import { Injectable } from '@nestjs/common';
import { EmailPlan, PromptMessages } from './ai.types';
import { LanguageNormalizerService } from './language-normalizer.service';

@Injectable()
export class PromptBuilderService {
  constructor(private readonly languages: LanguageNormalizerService) {}

  build(plan: EmailPlan, transcript: string, retryFeedback?: string): PromptMessages {
    return {
      system: this.systemPrompt(),
      developer: this.developerPrompt(plan, retryFeedback),
      user: this.userPrompt(plan, transcript),
    };
  }

  private systemPrompt() {
    return [
      'You are Z, a production-grade multilingual AI email assistant.',
      'You write polished, ready-to-send emails only.',
      'You must output strict JSON and no markdown.',
    ].join('\n');
  }

  private developerPrompt(plan: EmailPlan, retryFeedback?: string) {
    return [
      'Follow the provided EmailPlan exactly.',
      `Output language: ${this.languages.languageName(plan.language)} (${plan.language}).`,
      `Tone: ${plan.tone}.`,
      'Do not include explanations inside the email body.',
      'Do not invent recipients, companies, dates, or facts not present in the plan.',
      'Include a natural greeting and closing.',
      'For Arabic, write the subject and body in Arabic with natural RTL text.',
      this.schema(),
      this.examples(),
      retryFeedback ? `Previous output was rejected: ${retryFeedback}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private userPrompt(plan: EmailPlan, transcript: string) {
    return JSON.stringify({
      transcript,
      emailPlan: plan,
      validationRules: {
        subjectMaxChars: 90,
        minBodyChars: 80,
        strictLanguage: plan.language,
      },
    });
  }

  private schema() {
    return [
      'Return JSON with exactly these keys:',
      '{"subject":"string","body":"string","language":"fr|en|ar|de|es|it|pt|nl|tr","outputLanguage":"fr|en|ar|de|es|it|pt|nl|tr","purpose":"string","recipient":"string","suggestedRecipient":"string","tone":"string"}',
    ].join('\n');
  }

  private examples() {
    return [
      'Example: For French transcript requesting Spanish, subject and body must be Spanish.',
      'Example: For Arabic transcript requesting English, subject and body must be English.',
    ].join('\n');
  }
}
