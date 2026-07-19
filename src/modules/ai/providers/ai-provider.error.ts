export type AiProviderErrorKind =
  | 'timeout'
  | 'network'
  | 'http'
  | 'empty_response'
  | 'invalid_json'
  | 'invalid_output'
  | 'authentication'
  | 'unavailable';

export class AiProviderError extends Error {
  readonly cause?: unknown;

  constructor(
    readonly kind: AiProviderErrorKind,
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = 'AiProviderError';
    this.cause = options?.cause;
  }
}
