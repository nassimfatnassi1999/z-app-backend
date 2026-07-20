import { Injectable } from '@nestjs/common';
import { GeneratedEmailContent } from '../providers/email-ai-provider.types';

export interface EmailValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  criticalFacts: string[];
}

const MONTHS =
  'janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december';
const NUMBER_WORDS: Record<string, string[]> = {
  vingt: ['vingt', '20'],
  twenty: ['twenty', '20'],
  dix: ['dix', '10'],
  ten: ['ten', '10'],
  quinze: ['quinze', '15'],
  fifteen: ['fifteen', '15'],
};
const GREETINGS: Record<string, RegExp> = {
  fr: /^(?:bonjour|bonsoir|madame|monsieur)/i,
  en: /^(?:hello|hi|dear|good (?:morning|afternoon|evening))/i,
};
const CLOSINGS: Record<string, RegExp> = {
  fr: /(?:cordialement|bien cordialement|bien à vous|respectueusement|salutations(?: distinguées)?|merci(?: par avance)?|je vous remercie[^\n]*)[,!.]?\s*$/i,
  en: /(?:kind regards|best regards|warm regards|regards|sincerely|yours sincerely|yours faithfully|thank you(?: for your understanding)?)[,.]?\s*$/i,
};

@Injectable()
export class EmailValidationService {
  validate(
    transcript: string,
    email: GeneratedEmailContent,
    expectedLanguage?: string,
  ): EmailValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const subject = email.subject.trim();
    const body = email.body.trim();
    const language = (expectedLanguage || email.detectedLanguage || '').toLowerCase().split('-')[0];

    if (!subject) errors.push('MISSING_SUBJECT');
    if (!body) errors.push('MISSING_BODY');
    if (/^(?:objet|subject)\s*:/i.test(subject)) errors.push('SUBJECT_HAS_LABEL');
    if (/[.!?]$/.test(subject)) errors.push('SUBJECT_ENDS_WITH_PUNCTUATION');
    if (subject.split(/\s+/).length > 12 || subject.length > 100) errors.push('SUBJECT_TOO_LONG');
    if (/```|^\s*#{1,6}\s|\*\*|^\s*(?:here is|voici)\b/im.test(`${subject}\n${body}`)) {
      errors.push('PARASITE_OR_MARKDOWN_TEXT');
    }
    if (
      /\[(?:[^\]]*(?:nom|name|entreprise|company|signature|destinataire|recipient)[^\]]*)\]/i.test(
        body,
      )
    ) {
      errors.push('INVENTED_PLACEHOLDER');
    }
    if (body.length > 10_000) errors.push('BODY_TOO_LONG');
    if (/\b(?:euh|heu|hum|hmm|um|uh|erm|donc voilà)\b/i.test(body)) {
      errors.push('SPEECH_FILLER_REMAINS');
    }

    const greeting = GREETINGS[language] ?? /^(?:bonjour|hello|dear|hi|hola|guten tag|buongiorno)/i;
    const closing =
      CLOSINGS[language] ?? /(?:regards|cordialement|sincerely|saluti|atentamente)[,.]?\s*$/i;
    if (!greeting.test(body)) errors.push('MISSING_GREETING');
    if (!closing.test(body)) errors.push('MISSING_CLOSING');
    if (expectedLanguage && !this.languageMatches(body, language)) errors.push('LANGUAGE_MISMATCH');

    const normalizedTranscript = this.normalize(transcript);
    const normalizedBody = this.normalize(body);
    if (normalizedBody === normalizedTranscript || this.looksCopied(transcript, body)) {
      errors.push('TRANSCRIPT_LIKE_BODY');
    }

    const criticalFacts = this.extractCriticalFacts(transcript);
    for (const fact of criticalFacts) {
      if (!this.factIsPresent(fact, body)) errors.push(`MISSING_CRITICAL_FACT:${fact}`);
    }
    for (const fact of this.extractCriticalFacts(`${subject}\n${body}`)) {
      if (!this.factIsPresent(fact, transcript) && !this.isNeutralScaffolding(fact)) {
        errors.push(`UNSUPPORTED_CRITICAL_FACT:${fact}`);
      }
    }

    const sentences = body
      .split(/[.!?\n]+/)
      .map((value) => this.normalize(value))
      .filter((value) => value.length > 12);
    if (new Set(sentences).size !== sentences.length) errors.push('DUPLICATED_CONTENT');
    if (body.split(/\n\s*\n/).length < 2) warnings.push('WEAK_PARAGRAPH_STRUCTURE');

    return { valid: errors.length === 0, errors: [...new Set(errors)], warnings, criticalFacts };
  }

  private extractCriticalFacts(value: string): string[] {
    const facts = new Set<string>();
    const patterns = [
      new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS})\\b`, 'giu'),
      /\b\d{1,2}\s?h(?:\s?\d{2})?\b/giu,
      /\b\d+(?:[.,]\d+)?\s?(?:€|\$|£|TND|EUR|USD|%|ordinateurs?|computers?)?\b/giu,
      /\b(?:réf(?:érence)?|reference)\s*[:#-]?\s*[\p{L}\p{N}-]+\b/giu,
    ];
    for (const pattern of patterns)
      for (const match of value.match(pattern) ?? []) facts.add(match.trim());
    for (const [word] of Object.entries(NUMBER_WORDS)) {
      if (new RegExp(`\\b${word}\\b`, 'iu').test(value)) facts.add(word);
    }
    const capitalized = value.matchAll(
      /\b\p{Lu}[\p{L}\p{M}'’-]+(?:[ \t]+\p{Lu}[\p{L}\p{M}'’-]+)*/gu,
    );
    const ignored =
      /^(?:Bonjour|Bonsoir|Hello|Dear|Tell|Ask|Write|Écris|Ecris|Je|Nous|Confirme|Demande|Monsieur|Madame)$/iu;
    for (const match of capitalized) {
      const name = match[0];
      const prefix = value.slice(0, match.index ?? 0);
      const startsSentence = /(?:^|[.!?\n]\s*)$/u.test(prefix);
      if (startsSentence && !/^(?:Monsieur|Madame)\s/u.test(name)) continue;
      if (!ignored.test(name) && !new RegExp(`^(?:${MONTHS})$`, 'iu').test(name)) facts.add(name);
    }
    return [...facts];
  }

  private factIsPresent(fact: string, target: string) {
    const normalizedTarget = this.normalize(target);
    const normalizedFact = this.normalize(fact);
    const numericWithLabel = normalizedFact.match(/^(\d+)(\s+.+)$/u);
    if (numericWithLabel) {
      const equivalent = Object.values(NUMBER_WORDS).find((values) =>
        values.includes(numericWithLabel[1]),
      );
      if (equivalent) {
        return equivalent.some((number) =>
          this.contains(normalizedTarget, `${number}${numericWithLabel[2]}`),
        );
      }
    }
    const alternatives = NUMBER_WORDS[normalizedFact];
    if (alternatives) return alternatives.some((value) => this.contains(normalizedTarget, value));
    const wordEquivalent = Object.values(NUMBER_WORDS).find((values) =>
      values.includes(normalizedFact),
    );
    if (wordEquivalent) {
      return wordEquivalent.some((value) => this.contains(normalizedTarget, value));
    }
    return this.contains(normalizedTarget, normalizedFact);
  }

  private isNeutralScaffolding(fact: string) {
    return /^(?:Bonjour|Bonsoir|Hello|Dear|Cordialement|Merci|Kind Regards|Best Regards)$/iu.test(
      fact,
    );
  }

  private languageMatches(body: string, language: string) {
    const normalized = this.normalize(body);
    const french = (
      normalized.match(/\b(?:je|vous|nous|le|la|les|pour|avec|merci|bonjour)\b/g) ?? []
    ).length;
    const english = (normalized.match(/\b(?:i|you|we|the|for|with|thank|hello|dear)\b/g) ?? [])
      .length;
    if (language === 'fr') return french >= english;
    if (language === 'en') return english >= french;
    return true;
  }

  private looksCopied(transcript: string, body: string) {
    const source = new Set(this.contentTokens(transcript));
    const output = new Set(this.contentTokens(body));
    if (source.size < 5) return false;
    let shared = 0;
    for (const token of source) if (output.has(token)) shared += 1;
    const sourceCoverage = shared / source.size;
    const outputCoverage = shared / Math.max(output.size, 1);
    return sourceCoverage > 0.92 && outputCoverage > 0.82;
  }

  private contentTokens(value: string) {
    const stop = new Set(['bonjour', 'hello', 'cordialement', 'regards', 'merci', 'thank']);
    return this.normalize(value)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 2 && !stop.has(token));
  }

  private contains(value: string, term: string) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'u').test(value);
  }

  private normalize(value: string) {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’]/g, "'")
      .toLocaleLowerCase('fr')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
