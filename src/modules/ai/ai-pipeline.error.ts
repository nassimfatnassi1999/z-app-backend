import { HttpException, HttpStatus } from '@nestjs/common';

export type AiErrorCode =
  | 'AI_ANALYSIS_FAILED'
  | 'AI_INVALID_ANALYSIS'
  | 'AI_GENERATION_FAILED'
  | 'AI_INVALID_RESPONSE'
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_MODEL_UNAVAILABLE'
  | 'EMAIL_DRAFT_VALIDATION_FAILED'
  | 'AI_REPAIR_FAILED';

export class AiPipelineException extends HttpException {
  constructor(
    public readonly code: AiErrorCode,
    public readonly retryable: boolean,
    public readonly requestId: string,
    public readonly internalMessage: string,
    status = HttpStatus.SERVICE_UNAVAILABLE,
    public readonly stage: 'analysis' | 'generation' | 'validation' | 'repair' = code.includes('ANALYSIS')
      ? 'analysis'
      : code.includes('VALIDATION') || code.includes('LANGUAGE') || code.includes('FACT')
        ? 'validation'
        : code.includes('REPAIR')
          ? 'repair'
          : 'generation',
  ) {
    super(
      {
        code,
        message: 'Impossible de générer l’email pour le moment.',
        retryable,
        requestId,
        stage,
      },
      status,
    );
  }
}

export class EmailDraftValidationError extends AiPipelineException {
  constructor(requestId: string, public readonly issues: Array<{ code: string; message: string }>) {
    super(
      'EMAIL_DRAFT_VALIDATION_FAILED',
      true,
      requestId,
      'Generated email could not be validated.',
      422,
      'validation',
    );
  }
}
