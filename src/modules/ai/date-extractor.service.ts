import { Injectable } from '@nestjs/common';

@Injectable()
export class DateExtractorService {
  extract(transcript: string, now = new Date()) {
    const normalized = transcript.toLowerCase();
    const match = dateRules.find((rule) =>
      rule.signals.some((signal) => normalized.includes(signal)),
    );
    if (!match) return {};
    const date = new Date(now);
    date.setDate(date.getDate() + match.offsetDays);
    return {
      dateText: match.label,
      date: date.toISOString().slice(0, 10),
      time: this.extractTime(normalized),
    };
  }

  private extractTime(transcript: string) {
    if (
      transcript.includes('morning') ||
      transcript.includes('matin') ||
      transcript.includes('صباح')
    ) {
      return 'morning';
    }
    if (
      transcript.includes('evening') ||
      transcript.includes('soir') ||
      transcript.includes('مساء')
    ) {
      return 'evening';
    }
    const explicit = transcript.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)?\b/);
    return explicit?.[0];
  }
}

const dateRules = [
  {
    signals: ['after tomorrow', 'après-demain', 'apres-demain', 'بعد غد'],
    offsetDays: 2,
    label: 'after tomorrow',
  },
  { signals: ['tomorrow', 'demain', 'غدا', 'غداً'], offsetDays: 1, label: 'tomorrow' },
  {
    signals: ['next week', 'semaine prochaine', 'الأسبوع القادم'],
    offsetDays: 7,
    label: 'next week',
  },
  { signals: ['next month', 'mois prochain', 'الشهر القادم'], offsetDays: 30, label: 'next month' },
  { signals: ['ce soir', 'tonight'], offsetDays: 0, label: 'tonight' },
  { signals: ['next monday', 'lundi prochain'], offsetDays: 3, label: 'next Monday' },
  {
    signals: ['after ramadan', 'après ramadan', 'apres ramadan'],
    offsetDays: 30,
    label: 'after Ramadan',
  },
];
