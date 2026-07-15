import { HttpException, HttpStatus } from '@nestjs/common';

export type BusinessErrorCode =
  | 'NO_SPEECH'
  | 'AUDIO_TOO_SHORT'
  | 'AUDIO_INVALID'
  | 'LOW_CONFIDENCE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'AI_GENERATION_FAILED'
  | 'AUDIO_EMPTY'
  | 'AUDIO_TOO_LARGE'
  | 'AUDIO_UNSUPPORTED'
  | 'AUDIO_TOO_SILENT'
  | 'STT_PROVIDER_TIMEOUT'
  | 'STT_NETWORK_ERROR'
  | 'STT_PROVIDER_ERROR'
  | 'STT_LOW_CONFIDENCE'
  | 'AI_INVALID_OUTPUT'
  | 'AI_VALIDATION_FAILED'
  | 'AI_PROVIDER_TIMEOUT'
  | 'CLARIFICATION_REQUIRED'
  | 'DRAFT_SAVE_FAILED'
  | 'UNAUTHORIZED'
  | 'RATE_LIMIT_EXCEEDED';

export class BusinessException extends HttpException {
  constructor(
    code: BusinessErrorCode,
    message: string,
    retryable: boolean,
    status = HttpStatus.BAD_REQUEST,
  ) {
    super({ success: false, error: { code, message, retryable } }, status);
  }
}
