import { Injectable } from '@nestjs/common';
import {
  EmailPlan,
  EmailPurpose,
  EmailTone,
  ExtractedEntities,
  IntentAnalysis,
  LanguageAnalysis,
  TranscriptAnalysis,
} from './ai.types';

@Injectable()
export class EmailPlannerService {
  plan(input: {
    transcript: TranscriptAnalysis;
    language: LanguageAnalysis;
    intent: IntentAnalysis;
    entities: ExtractedEntities;
    selectedTone?: string;
    customTone?: string;
  }): EmailPlan {
    const tone = this.resolveTone(
      input.selectedTone,
      input.customTone,
      input.entities,
      input.intent,
    );
    return {
      goal: input.intent.summary,
      recipient: input.entities.recipient,
      language: input.language.outputLanguage,
      tone,
      subjectHint: this.subjectHint(input.intent.purpose),
      sections: ['Greeting', 'Introduction', 'Purpose', 'Context', 'Call to action', 'Closing'],
      entities: input.entities,
      intent: input.intent,
      transcriptLanguage: input.language.transcriptLanguage,
    };
  }

  private resolveTone(
    selectedTone: string | undefined,
    customTone: string | undefined,
    entities: ExtractedEntities,
    intent: IntentAnalysis,
  ) {
    const normalized = this.normalizeTone(selectedTone || customTone);
    if (normalized) return normalized;
    if (entities.tone) return entities.tone;
    if (intent.purpose === EmailPurpose.Complaint) return EmailTone.Complaint;
    if (intent.purpose === EmailPurpose.Reminder) return EmailTone.Reminder;
    if (intent.purpose === EmailPurpose.Internship) return EmailTone.Internship;
    return EmailTone.Professional;
  }

  private normalizeTone(value?: string) {
    const clean = (value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[-\s]+/g, '_');
    return Object.values(EmailTone).includes(clean as EmailTone) ? (clean as EmailTone) : undefined;
  }

  private subjectHint(purpose: EmailPurpose) {
    const subjects: Record<EmailPurpose, string> = {
      [EmailPurpose.Meeting]: 'Meeting Request',
      [EmailPurpose.Complaint]: 'Complaint',
      [EmailPurpose.JobApplication]: 'Job Application',
      [EmailPurpose.Internship]: 'Internship Application',
      [EmailPurpose.FollowUp]: 'Follow-up',
      [EmailPurpose.Invoice]: 'Invoice',
      [EmailPurpose.Quotation]: 'Quotation Request',
      [EmailPurpose.SupportRequest]: 'Support Request',
      [EmailPurpose.Cancellation]: 'Cancellation Request',
      [EmailPurpose.ThankYou]: 'Thank You',
      [EmailPurpose.Reminder]: 'Reminder',
      [EmailPurpose.Request]: 'Request',
      [EmailPurpose.Invitation]: 'Invitation',
      [EmailPurpose.Proposal]: 'Proposal',
      [EmailPurpose.Interview]: 'Interview Request',
      [EmailPurpose.General]: 'Follow-up',
    };
    return subjects[purpose];
  }
}
