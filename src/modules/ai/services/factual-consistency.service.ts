import { Injectable } from '@nestjs/common';
import { GeneratedEmail } from '../schemas/ai.schemas';

export type UnsupportedFactKind = 'number' | 'date' | 'contact' | 'named_entity';

export type FactualConsistencyAudit = {
  pass: boolean;
  unsupported: Array<{ kind: UnsupportedFactKind; value: string }>;
  counts: Record<UnsupportedFactKind, number>;
};

@Injectable()
export class FactualConsistencyService {
  private readonly structuralWords = new Set(
    [
      'bonjour',
      'bonsoir',
      'salut',
      'hello',
      'hi',
      'dear',
      'objet',
      'subject',
      'message',
      'cordialement',
      'sincerely',
      'regards',
      'best',
      'merci',
      'thanks',
      'thank',
      'je',
      'j',
      'nous',
      'vous',
      'tu',
      'il',
      'elle',
      'on',
      'i',
      'we',
      'you',
      'he',
      'she',
      'they',
      'the',
      'a',
      'an',
      'le',
      'la',
      'les',
      'un',
      'une',
      'des',
      'ce',
      'cette',
      'ces',
      'pour',
      'suite',
    ].map((value) => this.normalize(value)),
  );

  private readonly dateWords = [
    'lundi',
    'mardi',
    'mercredi',
    'jeudi',
    'vendredi',
    'samedi',
    'dimanche',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
    'aujourd’hui',
    "aujourd'hui",
    'demain',
    'hier',
    'today',
    'tomorrow',
    'yesterday',
  ];

  audit(transcript: string, email: GeneratedEmail): FactualConsistencyAudit {
    const source = this.normalize(transcript);
    const output = [email.subject, email.body, email.recipientSuggestion ?? ''].join('\n');
    const unsupported: FactualConsistencyAudit['unsupported'] = [];
    const seen = new Set<string>();
    const add = (kind: UnsupportedFactKind, rawValue: string) => {
      const value = rawValue.trim();
      const key = `${kind}:${this.normalize(value)}`;
      if (!value || seen.has(key) || source.includes(this.normalize(value))) return;
      seen.add(key);
      unsupported.push({ kind, value });
    };

    for (const value of output.match(/\b\d+(?:[.,]\d+)*(?:\s?(?:%|€|\$|£|usd|eur|tnd))?\b/giu) ??
      []) {
      const numeric = value.match(/\d+(?:[.,]\d+)*/)?.[0] ?? value;
      if (!source.includes(this.normalize(numeric))) add('number', value);
    }
    for (const value of output.match(
      /\b(?:https?:\/\/|www\.)\S+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/giu,
    ) ?? []) {
      add('contact', value.replace(/[.,;:!?]+$/, ''));
    }
    for (const word of this.dateWords) {
      const normalizedWord = this.normalize(word);
      if (this.normalize(output).includes(normalizedWord) && !source.includes(normalizedWord)) {
        add('date', word);
      }
    }
    for (const match of output.matchAll(
      /\b\p{Lu}[\p{L}\p{M}'’-]*(?:[ \t]+\p{Lu}[\p{L}\p{M}'’-]*)*/gu,
    )) {
      const value = match[0];
      const normalized = this.normalize(value);
      const isSingleWord = !/\s/u.test(value);
      const prefix = output.slice(0, match.index ?? 0);
      const startsSentence = /(?:^|[.!?\n]\s*)$/u.test(prefix);
      if (isSingleWord && startsSentence && value !== value.toLocaleUpperCase('fr')) continue;
      if (!this.structuralWords.has(normalized)) add('named_entity', value);
    }

    const counts: FactualConsistencyAudit['counts'] = {
      number: 0,
      date: 0,
      contact: 0,
      named_entity: 0,
    };
    for (const issue of unsupported) counts[issue.kind] += 1;
    return { pass: unsupported.length === 0, unsupported, counts };
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
