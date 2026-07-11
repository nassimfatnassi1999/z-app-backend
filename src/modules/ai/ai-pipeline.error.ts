import { HttpException, HttpStatus } from '@nestjs/common';

export type AiErrorCode =
  | 'AI_ANALYSIS_FAILED'
  | 'AI_INVALID_ANALYSIS'
  | 'AI_GENERATION_FAILED'
  | 'AI_INVALID_RESPONSE'
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_MODEL_UNAVAILABLE';

export class AiPipelineException extends HttpException {
  constructor(
    public readonly code: AiErrorCode,
    public readonly retryable: boolean,
    public readonly requestId: string,
    public readonly internalMessage: string,
    status = HttpStatus.SERVICE_UNAVAILABLE,
  ) {
    super(
      {
        code,
        message: 'Impossible de générer l’email pour le moment.',
        retryable,
        requestId,
      },
      status,
    );
  }
}
