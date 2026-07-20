import { HttpException, HttpStatus } from '@nestjs/common';

export type AiErrorCode =
  | 'EMPTY_TRANSCRIPT'
  | 'TRANSCRIPT_TOO_LONG'
  | 'NO_AI_PROVIDER_AVAILABLE'
  | 'AI_PROVIDER_TIMEOUT'
  | 'INVALID_AI_RESPONSE'
  | 'EMAIL_VALIDATION_FAILED'
  | 'EMAIL_GENERATION_FAILED';

export class AiPipelineException extends HttpException {
  constructor(
    public readonly code: AiErrorCode,
    public readonly retryable: boolean,
    public readonly requestId: string,
    public readonly internalMessage: string,
    status = HttpStatus.SERVICE_UNAVAILABLE,
    public readonly stage: 'normalization' | 'generation' | 'validation' | 'repair' = code.includes(
      'TRANSCRIPT',
    )
      ? 'normalization'
      : code.includes('VALIDATION')
        ? 'validation'
        : 'generation',
  ) {
    super(
      {
        code,
        message: userMessage(code),
        retryable,
        requestId,
        stage,
      },
      status,
    );
  }
}

function userMessage(code: AiErrorCode) {
  const messages: Record<AiErrorCode, string> = {
    EMPTY_TRANSCRIPT: 'La transcription est vide.',
    TRANSCRIPT_TOO_LONG: 'La transcription est trop longue pour être traitée.',
    NO_AI_PROVIDER_AVAILABLE: 'Le service de rédaction est temporairement indisponible.',
    AI_PROVIDER_TIMEOUT: 'La rédaction prend trop de temps. Veuillez réessayer.',
    INVALID_AI_RESPONSE: 'La réponse de rédaction reçue est invalide. Veuillez réessayer.',
    EMAIL_VALIDATION_FAILED: 'L’email généré n’a pas pu être validé.',
    EMAIL_GENERATION_FAILED: 'Impossible de générer l’email pour le moment.',
  };
  return messages[code];
}

export class EmailDraftValidationError extends AiPipelineException {
  constructor(
    requestId: string,
    public readonly issues: Array<{ code: string; message: string }>,
  ) {
    super(
      'EMAIL_VALIDATION_FAILED',
      false,
      requestId,
      'Generated email could not be validated.',
      422,
      'validation',
    );
  }
}
