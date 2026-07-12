export class SpeechProviderError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean, message: string) { super(message); }
}
export class SpeechProviderTimeoutError extends SpeechProviderError { constructor() { super('STT_TIMEOUT', true, 'Speech provider timed out'); } }
export class SpeechProviderRateLimitError extends SpeechProviderError { constructor() { super('STT_RATE_LIMITED', true, 'Speech provider rate limited'); } }
export class SpeechProviderUnavailableError extends SpeechProviderError { constructor() { super('STT_UNAVAILABLE', true, 'Speech provider unavailable'); } }
export class InvalidAudioError extends SpeechProviderError { constructor(message = 'Invalid audio') { super('INVALID_AUDIO', false, message); } }
export class EmptyTranscriptionError extends SpeechProviderError { constructor() { super('EMPTY_TRANSCRIPTION', false, 'Empty transcription'); } }
