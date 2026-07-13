import { Injectable } from '@nestjs/common';
import { analysisPrompt } from './email-analysis.v1';
import { generationPrompt } from './email-generation.v1';
import { repairPrompt } from './email-repair.v1';
import { rewritePrompt } from './email-rewrite.v1';
import { analysisPromptV2 } from './email-analysis.v2';
import { generationPromptV2 } from './email-generation.v2';
import { repairPromptV2 } from './email-repair.v2';
import { rewritePromptV2 } from './email-rewrite.v2';

export type PromptId =
  | 'email-analysis.v1'
  | 'email-generation.v1'
  | 'email-rewrite.v1'
  | 'email-repair.v1'
  | 'email-analysis.v2'
  | 'email-generation.v2'
  | 'email-rewrite.v2'
  | 'email-repair.v2';

export interface PromptDefinition<TInput = unknown> {
  id: PromptId;
  version: string;
  description: string;
  build(input: TInput): { system: string; user: string };
}

@Injectable()
export class PromptRegistry {
  private readonly prompts = new Map<PromptId, PromptDefinition>(
    [analysisPrompt, generationPrompt, rewritePrompt, repairPrompt, analysisPromptV2, generationPromptV2, rewritePromptV2, repairPromptV2]
      .map((prompt) => [prompt.id, prompt]),
  );

  get<TInput>(id: PromptId): PromptDefinition<TInput> {
    const prompt = this.prompts.get(id);
    if (!prompt) throw new Error(`Unknown prompt: ${id}`);
    return prompt as PromptDefinition<TInput>;
  }
}
