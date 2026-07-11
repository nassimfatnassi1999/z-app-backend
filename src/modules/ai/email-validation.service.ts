import { Injectable } from '@nestjs/common';
import { EmailIntentAnalysis, GeneratedEmailResponse } from './ai.types';

@Injectable()
export class EmailValidationService {
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
}
