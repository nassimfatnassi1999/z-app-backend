import { Injectable } from '@nestjs/common';
import { EmailPurpose, IntentAnalysis } from './ai.types';

@Injectable()
export class IntentExtractorService {
  extract(transcript: string): IntentAnalysis {
    const normalized = transcript.toLowerCase();
    const match = intentRules.find((rule) =>
      rule.signals.some((signal) => normalized.includes(signal)),
    );
    const purpose = match?.purpose ?? EmailPurpose.General;
    return {
      purpose,
      confidence: match ? 86 : 58,
      summary: this.summaryFor(purpose),
    };
  }

  private summaryFor(purpose: EmailPurpose) {
    return purpose.replace(/_/g, ' ');
  }
}

const intentRules = [
  { purpose: EmailPurpose.Interview, signals: ['entretien', 'interview'] },
  { purpose: EmailPurpose.Internship, signals: ['stage', 'internship', 'stagiaire'] },
  {
    purpose: EmailPurpose.Meeting,
    signals: ['meeting', 'réunion', 'reunion', 'rendez-vous', 'موعد', 'اجتماع'],
  },
  { purpose: EmailPurpose.FollowUp, signals: ['follow up', 'relance', 'suivi'] },
  { purpose: EmailPurpose.Reminder, signals: ['reminder', 'rappel'] },
  { purpose: EmailPurpose.Complaint, signals: ['complaint', 'plainte', 'réclamation'] },
  { purpose: EmailPurpose.Invoice, signals: ['invoice', 'facture'] },
  { purpose: EmailPurpose.Quotation, signals: ['quotation', 'devis', 'quote'] },
  { purpose: EmailPurpose.SupportRequest, signals: ['support', 'assistance', 'help'] },
  { purpose: EmailPurpose.Cancellation, signals: ['cancel', 'annuler', 'cancellation'] },
  { purpose: EmailPurpose.ThankYou, signals: ['thank', 'remercier', 'merci'] },
  { purpose: EmailPurpose.Invitation, signals: ['invite', 'invitation', 'inviter'] },
  { purpose: EmailPurpose.Proposal, signals: ['proposal', 'proposition'] },
  { purpose: EmailPurpose.JobApplication, signals: ['job application', 'candidature', 'emploi'] },
  { purpose: EmailPurpose.Request, signals: ['ask', 'demander', 'request', 'طلب'] },
];
