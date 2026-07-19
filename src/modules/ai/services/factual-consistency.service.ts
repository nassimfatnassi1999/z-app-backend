import { Injectable } from '@nestjs/common';
import { GeneratedEmail, TranscriptExtraction } from '../schemas/ai.schemas';

type AuditedEmail = Pick<GeneratedEmail, 'subject' | 'body' | 'recipient'> & {
  language?: string;
  confidence?: number;
};
type LegacyExtraction = {
  language: string;
  recipient: string | null;
  dates: string[];
  amounts: string[];
  names: string[];
  keywords: string[];
  transcriptionCorrections: Array<{ source: string; corrected: string }>;
  intent?: string;
  facts?: string[];
  constraints?: string[];
  requestedActions?: string[];
  tone?: string;
  ambiguities?: string[];
  needsClarification?: boolean;
  clarificationQuestions?: string[];
};

export type ProtectedFactKind =
  | 'number'
  | 'date'
  | 'contact'
  | 'named_entity'
  | 'keyword'
  | 'semantic_marker';

type FactualIssue = { kind: ProtectedFactKind; value: string };

export type FactualConsistencyAudit = {
  pass: boolean;
  unsupported: FactualIssue[];
  missing: FactualIssue[];
  counts: Record<ProtectedFactKind, number>;
  missingCounts: Record<ProtectedFactKind, number>;
};

@Injectable()
export class FactualConsistencyService {
  private readonly semanticMarkers: Record<string, Record<string, string[]>> = {
    gratitude: {
      fr: ['merci', 'remercie'],
      en: ['thanks', 'thank you'],
      de: ['danke'],
      es: ['gracias'],
      it: ['grazie'],
      pt: ['obrigado', 'obrigada'],
      nl: ['bedankt', 'dank u'],
      tr: ['teşekkür'],
    },
    apology: {
      fr: ['désolé', 'désolée', 'excuse', 'pardon'],
      en: ['sorry', 'apologize', 'apologise', 'regret'],
      de: ['entschuldigung', 'tut mir leid'],
      es: ['lo siento', 'disculpa'],
      it: ['mi dispiace', 'scusa'],
      pt: ['desculpe', 'sinto muito'],
      nl: ['sorry', 'excuses'],
      tr: ['özür', 'üzgünüm'],
    },
    uncertainty: {
      fr: ['je pense', 'peut-être', 'probablement'],
      en: ['i think', 'perhaps', 'maybe', 'probably'],
      de: ['ich denke', 'vielleicht', 'wahrscheinlich'],
      es: ['creo que', 'quizás', 'probablemente'],
      it: ['penso', 'forse', 'probabilmente'],
      pt: ['acho que', 'talvez', 'provavelmente'],
      nl: ['ik denk', 'misschien', 'waarschijnlijk'],
      tr: ['düşünüyorum', 'belki', 'muhtemelen'],
    },
  };

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
      'guten tag',
      'guten',
      'tag',
      'sehr geehrte',
      'sehr',
      'geehrte',
      'mit freundlichen grussen',
      'mit',
      'freundlichen',
      'grussen',
      'grüßen',
      'hola',
      'estimado',
      'estimada',
      'atentamente',
      'buenos dias',
      'buenos',
      'dias',
      'buongiorno',
      'gentile',
      'cordiali saluti',
      'cordiali',
      'saluti',
      'ola',
      'prezado',
      'prezada',
      'cumprimentos',
      'geachte',
      'beste',
      'met vriendelijke groet',
      'met',
      'vriendelijke',
      'groet',
      'merhaba',
      'sayin',
      'saygilarimla',
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
    'montag',
    'dienstag',
    'mittwoch',
    'donnerstag',
    'freitag',
    'samstag',
    'sonntag',
    'januar',
    'februar',
    'märz',
    'april',
    'mai',
    'juni',
    'juli',
    'august',
    'september',
    'oktober',
    'november',
    'dezember',
    'heute',
    'gestern',
    'lunes',
    'martes',
    'miércoles',
    'jueves',
    'viernes',
    'sábado',
    'domingo',
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
    'hoy',
    'mañana',
    'ayer',
    'lunedì',
    'martedì',
    'mercoledì',
    'giovedì',
    'venerdì',
    'sabato',
    'domenica',
    'gennaio',
    'febbraio',
    'marzo',
    'aprile',
    'maggio',
    'giugno',
    'luglio',
    'agosto',
    'settembre',
    'ottobre',
    'novembre',
    'dicembre',
    'oggi',
    'domani',
    'ieri',
    'segunda-feira',
    'terça-feira',
    'quarta-feira',
    'quinta-feira',
    'sexta-feira',
    'sábado',
    'domingo',
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
    'hoje',
    'amanhã',
    'ontem',
    'maandag',
    'dinsdag',
    'woensdag',
    'donderdag',
    'vrijdag',
    'zaterdag',
    'zondag',
    'januari',
    'februari',
    'maart',
    'april',
    'mei',
    'juni',
    'juli',
    'augustus',
    'september',
    'oktober',
    'november',
    'december',
    'vandaag',
    'gisteren',
    'pazartesi',
    'salı',
    'çarşamba',
    'perşembe',
    'cuma',
    'cumartesi',
    'pazar',
    'ocak',
    'şubat',
    'mart',
    'nisan',
    'mayıs',
    'haziran',
    'temmuz',
    'ağustos',
    'eylül',
    'ekim',
    'kasım',
    'aralık',
    'bugün',
    'yarın',
    'dün',
  ];

  audit(
    transcript: string,
    email: AuditedEmail,
    extraction?: TranscriptExtraction | LegacyExtraction,
  ): FactualConsistencyAudit {
    const source = this.normalize(transcript);
    const output = [email.subject, email.body, email.recipient].join('\n');
    const namedEntityOutput = [email.body, email.recipient].join('\n');
    const normalizedOutput = this.normalize(output);
    const unsupported: FactualConsistencyAudit['unsupported'] = [];
    const missing: FactualConsistencyAudit['missing'] = [];
    const seenUnsupported = new Set<string>();
    const seenMissing = new Set<string>();
    const add = (kind: ProtectedFactKind, rawValue: string) => {
      const value = rawValue.trim();
      const key = `${kind}:${this.normalize(value)}`;
      if (!value || seenUnsupported.has(key) || source.includes(this.normalize(value))) return;
      seenUnsupported.add(key);
      unsupported.push({ kind, value });
    };
    const forceUnsupported = (kind: ProtectedFactKind, rawValue: string) => {
      const value = rawValue.trim();
      const key = `${kind}:${this.normalize(value)}`;
      if (!value || seenUnsupported.has(key)) return;
      seenUnsupported.add(key);
      unsupported.push({ kind, value });
    };
    const addMissing = (kind: ProtectedFactKind, rawValue: string) => {
      const value = rawValue.trim();
      const normalized = this.normalize(value);
      const key = `${kind}:${normalized}`;
      if (
        !value ||
        !normalized ||
        seenMissing.has(key) ||
        !source.includes(normalized) ||
        normalizedOutput.includes(normalized)
      ) {
        return;
      }
      seenMissing.add(key);
      missing.push({ kind, value });
    };
    const forceMissing = (kind: ProtectedFactKind, rawValue: string) => {
      const value = rawValue.trim();
      const key = `${kind}:${this.normalize(value)}`;
      if (!value || seenMissing.has(key)) return;
      seenMissing.add(key);
      missing.push({ kind, value });
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
    for (const value of transcript.match(
      /\b(?:https?:\/\/|www\.)\S+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/giu,
    ) ?? []) {
      addMissing('contact', value.replace(/[.,;:!?]+$/, ''));
    }
    for (const value of transcript.match(
      /\b\d+(?:[.,]\d+)*(?:\s?(?:%|€|\$|£|usd|eur|tnd))?\b/giu,
    ) ?? []) {
      const numeric = value.match(/\d+(?:[.,]\d+)*/)?.[0] ?? value;
      if (!normalizedOutput.includes(this.normalize(numeric))) addMissing('number', value);
    }
    for (const word of this.dateWords) {
      const normalizedWord = this.normalize(word);
      if (
        this.containsTerm(normalizedOutput, normalizedWord) &&
        !this.containsTerm(source, normalizedWord)
      ) {
        add('date', word);
      }
      if (
        this.containsTerm(source, normalizedWord) &&
        !this.containsTerm(normalizedOutput, normalizedWord)
      ) {
        addMissing('date', word);
      }
    }
    if (email.recipient) add('named_entity', email.recipient);
    for (const match of namedEntityOutput.matchAll(
      /\b\p{Lu}[\p{L}\p{M}'’-]*(?:[ \t]+\p{Lu}[\p{L}\p{M}'’-]*)*/gu,
    )) {
      const value = match[0];
      const normalized = this.normalize(value);
      const isSingleWord = !/\s/u.test(value);
      const prefix = namedEntityOutput.slice(0, match.index ?? 0);
      const startsSentence = /(?:^|[.!?\n]\s*)$/u.test(prefix);
      if (isSingleWord && startsSentence && value !== value.toLocaleUpperCase('fr')) continue;
      if (this.structuralWords.has(normalized) || source.includes(normalized)) continue;
      for (const token of value.split(/\s+/u)) {
        const normalizedToken = this.normalize(token);
        if (!this.structuralWords.has(normalizedToken)) add('named_entity', token);
      }
    }

    if (extraction) {
      const modern = 'detectedLanguage' in extraction;
      const people = modern ? extraction.people : extraction.names;
      const quantities = modern ? extraction.quantities : [];
      const keywords = modern
        ? [...extraction.products, ...extraction.actions]
        : extraction.keywords;
      const corrections = modern
        ? extraction.transcriptCorrections
        : extraction.transcriptionCorrections.map((value) => ({
            original: value.source,
            corrected: value.corrected,
          }));
      for (const name of people) addMissing('named_entity', name);
      if (extraction.recipient) addMissing('named_entity', extraction.recipient);
      for (const date of extraction.dates) addMissing('date', date);
      for (const amount of extraction.amounts) addMissing('number', amount);
      for (const quantity of quantities) addMissing('number', quantity);
      for (const keyword of keywords) {
        addMissing('keyword', keyword);
      }
      for (const correction of corrections) {
        const sourceTerm = this.normalize(correction.original);
        const correctedTerm = this.normalize(correction.corrected);
        if (
          source.includes(sourceTerm) &&
          !this.containsTerm(normalizedOutput, correctedTerm) &&
          !this.containsTerm(normalizedOutput, sourceTerm)
        ) {
          forceMissing('keyword', correction.corrected);
        }
        if (
          sourceTerm !== correctedTerm &&
          this.containsTerm(normalizedOutput, sourceTerm) &&
          !this.containsTerm(normalizedOutput, correctedTerm)
        ) {
          forceUnsupported('keyword', correction.original);
        }
      }

      const language = (modern ? extraction.detectedLanguage : extraction.language)
        .toLocaleLowerCase()
        .split('-')[0];
      for (const [label, markersByLanguage] of Object.entries(this.semanticMarkers)) {
        const markers = markersByLanguage[language] ?? [];
        const sourceMarker = markers.find((marker) => source.includes(this.normalize(marker)));
        const outputPreservesMarker = markers.some((marker) =>
          normalizedOutput.includes(this.normalize(marker)),
        );
        if (sourceMarker && !outputPreservesMarker) {
          forceMissing('semantic_marker', `${label}: ${sourceMarker}`);
        }
      }
    }

    const counts: FactualConsistencyAudit['counts'] = {
      number: 0,
      date: 0,
      contact: 0,
      named_entity: 0,
      keyword: 0,
      semantic_marker: 0,
    };
    const missingCounts: FactualConsistencyAudit['missingCounts'] = { ...counts };
    for (const issue of unsupported) counts[issue.kind] += 1;
    for (const issue of missing) missingCounts[issue.kind] += 1;
    return {
      pass: unsupported.length === 0 && missing.length === 0,
      unsupported,
      missing,
      counts,
      missingCounts,
    };
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

  private containsTerm(value: string, term: string) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'u').test(value);
  }
}
