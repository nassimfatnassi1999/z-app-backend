import { HttpException, HttpStatus } from '@nestjs/common';

export type BusinessErrorCode =
  | 'AUDIO_EMPTY'
  | 'AUDIO_TOO_LARGE'
  | 'AUDIO_UNSUPPORTED'
  | 'AUDIO_TOO_SILENT'
  | 'STT_PROVIDER_TIMEOUT'
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
