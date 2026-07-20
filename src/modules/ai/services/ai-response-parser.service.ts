import { Injectable } from '@nestjs/common';
import { generatedEmailContentSchema } from '../schemas/ai.schemas';
import { AiProviderError } from '../providers/ai-provider.error';
import { GeneratedEmailContent } from '../providers/email-ai-provider.types';

@Injectable()
export class AiResponseParserService {
  parse(content: string): GeneratedEmailContent {
    const normalized = content.trim();
    if (!normalized) throw new AiProviderError('empty_response', 'AI provider returned no content');
    const unfenced = normalized
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start < 0 || end < start) {
      throw new AiProviderError('invalid_json', 'AI provider response contains no JSON object');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(unfenced.slice(start, end + 1));
    } catch (cause) {
      throw new AiProviderError('invalid_json', 'AI provider returned invalid JSON', undefined, {
        cause,
      });
    }
    const result = generatedEmailContentSchema.safeParse(parsed);
    if (!result.success) {
      throw new AiProviderError(
        'invalid_output',
        `AI provider returned ${result.error.issues.length} invalid field(s)`,
      );
    }
    return result.data;
  }
}
