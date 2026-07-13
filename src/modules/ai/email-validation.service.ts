import { Injectable } from '@nestjs/common';
import {
  DraftValidationResult,
  EmailIntentAnalysis,
  EmailSourceContext,
  GeneratedEmailResponse,
  EmailQualityScore,
  ValidationIssue,
} from './ai.types';

@Injectable()
export class EmailValidationService {
  validateDraft(draft: GeneratedEmailResponse, source: EmailSourceContext): DraftValidationResult {
    const issues: ValidationIssue[] = [];
    const blocking = (code: string, message: string, field: ValidationIssue['field']) =>
      issues.push({ code, severity: 'blocking', message, field });
    const warning = (code: string, message: string, field: ValidationIssue['field']) =>
      issues.push({ code, severity: 'warning', message, field });
    if (!draft.subject.trim()) blocking('EMAIL_SUBJECT_EMPTY', 'Subject is empty', 'subject');
    else if (this.isGenericSubject(draft.subject)) warning('EMAIL_SUBJECT_TOO_GENERIC', 'Subject is too generic', 'subject');
    if (!draft.body.trim()) blocking('EMAIL_BODY_EMPTY', 'Body is empty', 'body');
    if (draft.body.trim().length > 0 && draft.body.trim().length < 20)
      warning('EMAIL_BODY_TOO_SHORT', 'Body is unusually short', 'body');
    const words = draft.body.trim().split(/\s+/).filter(Boolean);
    const paragraphs = draft.body.split(/\n\s*\n/).map((v) => v.trim()).filter(Boolean);
    if (/^(?:bonjour[^\n]*\n+)?\s*(?:j['’]espère que vous allez bien|je me permets de vous contacter|je vous écris pour)/i.test(draft.body))
      warning('EMAIL_OPENING_TOO_GENERIC', 'Opening is formulaic', 'body');
    if (paragraphs.some((paragraph) => paragraph.split(/\s+/).length > 110))
      warning('EMAIL_BODY_TOO_DENSE', 'A paragraph is too dense', 'body');
    if (paragraphs.length > 8) warning('EMAIL_BODY_TOO_FRAGMENTED', 'Body is too fragmented', 'body');
    if (words.length > ({ light: 170, medium: 270, full: 420 }[source.targetEnrichmentLevel]))
      warning('EMAIL_EXCESSIVE_LENGTH', 'Body exceeds the target level', 'body');
    if (words.length < ({ light: 35, medium: 70, full: 110 }[source.targetEnrichmentLevel]))
      warning('EMAIL_INSUFFICIENT_DETAIL', 'Body may be too sparse for the target level', 'body');
    if (/dans l.attente de votre retour|n.hésitez pas à me contacter pour toute information complémentaire/i.test(draft.body))
      warning('EMAIL_CLOSING_TOO_GENERIC', 'Closing is formulaic', 'body');
    if (/```|\{\s*"(?:subject|body)"|^(?:subject|body|objet|corps)\s*:/im.test(draft.body))
      blocking('EMAIL_FORMAT_INVALID', 'Raw JSON, Markdown, or field prefix is visible', 'body');
    if (/\[(?:Votre nom|Nom du destinataire|Entreprise|Date|Objet|à compléter)\]/i.test(draft.body))
      blocking('EMAIL_PLACEHOLDER_UNRESOLVED', 'Unresolved placeholder', 'body');
    if (draft.language.trim().toLowerCase().split('-')[0] !== source.languageContext.effectiveOutputLanguage)
      blocking('EMAIL_LANGUAGE_MISMATCH', 'Declared output language differs from resolved language', 'language');
    const detected = this.detectLanguage(draft.body);
    if (detected && detected !== source.languageContext.effectiveOutputLanguage)
      warning('EMAIL_BODY_LANGUAGE_UNCERTAIN', `Body appears to be ${detected}`, 'language');

    const output = this.normal(`${draft.subject} ${draft.body}`);
    for (const fact of source.requiredFacts) {
      if (!output.includes(this.normal(fact.value))) {
        blocking('EMAIL_REQUIRED_FACT_MISSING', `Required ${fact.kind} is missing`, 'facts');
      }
    }
    const sourceText = this.normal(`${source.rawTranscript} ${source.normalizedTranscript}`);
    for (const token of this.factualTokens(`${draft.subject} ${draft.body}`)) {
      if (!sourceText.includes(this.normal(token))) {
        blocking('EMAIL_UNSUPPORTED_FACT', 'Draft contains an unsupported date, amount, number, email, or phone', 'facts');
      }
    }
    for (const action of source.requestedActions) {
      const significant = this.normal(action).split(' ').filter((part) => part.length > 3);
      if (significant.length && !significant.some((part) => output.includes(part)))
        warning('EMAIL_ACTION_UNCLEAR', 'Requested action may be missing', 'facts');
    }
    const hasBlocking = issues.some((issue) => issue.severity === 'blocking');
    return { valid: !hasBlocking, issues, requiresRepair: hasBlocking };
  }

  score(draft: GeneratedEmailResponse, source: EmailSourceContext): EmailQualityScore {
    const issues = this.validateDraft(draft, source).issues;
    const has = (code: string) => issues.some((issue) => issue.code === code);
    const subjectSpecificity = has('EMAIL_SUBJECT_EMPTY') ? 0 : has('EMAIL_SUBJECT_TOO_GENERIC') ? 8 : 15;
    const clarity = has('EMAIL_PURPOSE_UNCLEAR') ? 8 : has('EMAIL_BODY_TOO_DENSE') ? 13 : 17;
    const structure = has('EMAIL_FORMAT_INVALID') ? 0 : has('EMAIL_BODY_TOO_FRAGMENTED') || has('EMAIL_BODY_TOO_DENSE') ? 10 : 15;
    const actionClarity = has('EMAIL_ACTION_UNCLEAR') ? 7 : 15;
    const toneConsistency = has('EMAIL_TONE_NOT_DISTINCT') ? 8 : 13;
    const factualFaithfulness = issues.some((i) => i.code === 'EMAIL_UNSUPPORTED_FACT' || i.code === 'EMAIL_REQUIRED_FACT_MISSING') ? 0 : 25;
    return { total: subjectSpecificity + clarity + structure + actionClarity + toneConsistency + factualFaithfulness, subjectSpecificity, clarity, structure, actionClarity, toneConsistency, factualFaithfulness };
  }

  validate(
    draft: GeneratedEmailResponse,
    transcript: string,
    _analysis: EmailIntentAnalysis,
  ): string[] {
    const issues: string[] = [];
    if (!draft.subject) issues.push('Missing subject');
    if (!draft.body) issues.push('Missing body');
    if (/```|\{\s*"(?:subject|body)"/i.test(draft.body))
      issues.push('Markdown or JSON leaked into body');
    if (/\b(?:Groq|Deepgram|transcription|application Z)\b/i.test(draft.body))
      issues.push('Internal technology leaked into body');
    const placeholders =
      draft.body.match(/\[(?:Votre nom|Nom du destinataire|Entreprise|Date|Objet)\]/gi) || [];
    for (const placeholder of placeholders)
      if (!transcript.toLocaleLowerCase().includes(placeholder.toLocaleLowerCase()))
        issues.push(`Invented placeholder: ${placeholder}`);
    return issues;
  }

  warnings(
    draft: GeneratedEmailResponse,
    transcript: string,
    analysis: EmailIntentAnalysis,
  ): string[] {
    const issues: string[] = [];
    if (draft.subject.split(/\s+/).length > 8) issues.push('Subject exceeds 8 words');
    if (/^(?:email|message|objet|sans objet)$/i.test(draft.subject)) issues.push('Generic subject');
    if (draft.body.length < 30) issues.push('Body is unusually short');
    if (this.normal(draft.body) === this.normal(transcript))
      issues.push('Body merely repeats transcript');
    const paragraphs = draft.body.split(/\n\s*\n/).filter((value) => value.trim());
    if (paragraphs.length < 3) issues.push('Body lacks greeting, developed content, or closing');
    const sentences = draft.body
      .split(/[.!?]+/)
      .map(this.normal)
      .filter((v) => v.length > 10);
    if (new Set(sentences).size !== sentences.length) issues.push('Repeated sentence');
    const facts = [
      ...analysis.facts,
      ...analysis.dates,
      ...analysis.amounts,
      ...analysis.locations,
      ...analysis.attachmentsMentioned,
    ];
    for (const fact of facts)
      if (!this.normal(draft.subject + ' ' + draft.body).includes(this.normal(fact)))
        issues.push(`Missing source fact: ${fact}`);
    const sourceNumbers = new Set(this.normal(transcript).match(/\b\d[\d.,:/-]*\b/g) || []);
    const outputNumbers =
      this.normal(`${draft.subject} ${draft.body}`).match(/\b\d[\d.,:/-]*\b/g) || [];
    for (const value of outputNumbers)
      if (!sourceNumbers.has(value)) issues.push(`Unsupported numeric fact: ${value}`);
    return issues;
  }

  private normal(value: string): string {
    return String(value || '')
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  private isGenericSubject(value: string): boolean {
    return /^(?:demande|bonjour|information|important|message|email|e-mail|contact|question)$/i.test(value.trim());
  }

  private factualTokens(value: string): string[] {
    return value.match(
      /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|\+?\d[\d ()/.:-]{2,}\d|\b\d+(?:[.,]\d+)?\s?(?:€|\$|USD|EUR|TND|DT)\b/giu,
    ) || [];
  }

  private detectLanguage(value: string): string | undefined {
    if (/[\u0600-\u06ff]/u.test(value)) return 'ar';
    const words = this.normal(value).split(' ');
    const score = (markers: Set<string>) => words.filter((word) => markers.has(word)).length;
    const fr = score(new Set(['bonjour', 'merci', 'vous', 'votre', 'nous', 'je', 'pour', 'avec', 'cordialement']));
    const en = score(new Set(['hello', 'thank', 'you', 'your', 'we', 'please', 'for', 'with', 'regards']));
    if (Math.max(fr, en) < 2) return undefined;
    return fr >= en ? 'fr' : 'en';
  }
}
