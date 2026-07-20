import { AiProviderError } from '../providers/ai-provider.error';
import { AiResponseParserService } from './ai-response-parser.service';

const valid = {
  subject: 'Réunion confirmée',
  body: 'Bonjour,\n\nLa réunion est confirmée.\n\nCordialement,',
  detectedLanguage: 'fr',
  detectedTone: 'professional',
  emailType: 'confirmation',
  confidence: 0.98,
};

describe('AiResponseParserService', () => {
  const parser = new AiResponseParserService();

  it('removes an optional fence and validates JSON with Zod', () => {
    expect(parser.parse(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``)).toEqual(valid);
  });

  it.each(['{invalid', JSON.stringify({ subject: 'Réunion' }), 'plain text'])(
    'rejects invalid provider output: %s',
    (content) => expect(() => parser.parse(content)).toThrow(AiProviderError),
  );
});
