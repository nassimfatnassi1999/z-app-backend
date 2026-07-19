import { AiProviderError } from '../providers/ai-provider.error';
import { AiResponseParserService } from './ai-response-parser.service';

const valid = {
  subject: 'Réunion',
  body: 'Bonjour,\n\nLa réunion est confirmée.\n\nCordialement,',
  detectedLanguage: 'fr',
  detectedRecipientType: 'person',
  detectedRelationship: 'professional',
  detectedTone: 'professional',
  emailIntent: 'confirm',
  emailComplexity: 'simple',
  confidence: 0.98,
  validationWarnings: [],
};

describe('AiResponseParserService', () => {
  const parser = new AiResponseParserService();

  it('extracts and validates JSON wrapped in a Markdown fence', () => {
    expect(parser.parse(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``)).toEqual(valid);
  });

  it('rejects malformed JSON with a failover-eligible error', () => {
    expect(() => parser.parse('{invalid')).toThrow(AiProviderError);
    try {
      parser.parse('{invalid');
    } catch (error) {
      expect(error).toMatchObject({ kind: 'invalid_json' });
    }
  });

  it('rejects partial output instead of silently normalizing it', () => {
    expect(() => parser.parse(JSON.stringify({ subject: 'Réunion', body: valid.body }))).toThrow(
      AiProviderError,
    );
  });
});
