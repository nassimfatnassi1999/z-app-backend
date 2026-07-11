import { ConfigService } from '@nestjs/config';
import { resolveGroqModels } from './ai-models';

describe('AI model resolution', () => {
  it('defaults to GPT-OSS primary and Llama fallback', () => {
    expect(resolveGroqModels(new ConfigService())).toEqual({
      primary: 'openai/gpt-oss-120b',
      fallback: 'llama-3.3-70b-versatile',
    });
  });

  it('keeps GROQ_MODEL as legacy primary compatibility', () => {
    expect(resolveGroqModels(new ConfigService({ GROQ_MODEL: 'legacy-model' }))).toEqual({
      primary: 'legacy-model',
      fallback: 'llama-3.3-70b-versatile',
    });
  });

  it('gives explicit primary and fallback variables precedence', () => {
    expect(
      resolveGroqModels(
        new ConfigService({
          GROQ_PRIMARY_MODEL: 'openai/gpt-oss-120b',
          GROQ_FALLBACK_MODEL: 'llama-3.3-70b-versatile',
          GROQ_MODEL: 'legacy-model',
        }),
      ),
    ).toEqual({
      primary: 'openai/gpt-oss-120b',
      fallback: 'llama-3.3-70b-versatile',
    });
  });
});
