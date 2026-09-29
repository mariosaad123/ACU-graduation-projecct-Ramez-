export type RecorderError =
  'permissionDenied' | 'noMicrophone' | 'unsupported' | 'insecureContext' | 'unknown';

export type RecorderState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'recording'; startedAt: number }
  | { status: 'recorded'; blob: Blob; url: string; durationMs: number }
  | { status: 'error'; error: RecorderError };

export type RecorderEvent =
  | { type: 'request' }
  | { type: 'started'; at: number }
  | { type: 'stopped'; blob: Blob; url: string; durationMs: number }
  | { type: 'failed'; error: RecorderError }
  | { type: 'reset' };

export const initialRecorderState: RecorderState = { status: 'idle' };

/** Pure transition function. Events that make no sense in the current state are ignored. */
export function recorderReducer(state: RecorderState, event: RecorderEvent): RecorderState {
  switch (event.type) {
    case 'request':
      return state.status === 'requesting' || state.status === 'recording'
        ? state
        : { status: 'requesting' };
    case 'started':
      return state.status === 'requesting' ? { status: 'recording', startedAt: event.at } : state;
    case 'stopped':
      return state.status === 'recording'
        ? { status: 'recorded', blob: event.blob, url: event.url, durationMs: event.durationMs }
        : state;
    case 'failed':
      return { status: 'error', error: event.error };
    case 'reset':
      return initialRecorderState;
  }
}

/** Maps getUserMedia / MediaRecorder failures to messages we can explain to the user. */
export function classifyMediaError(error: unknown): RecorderError {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'permissionDenied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'noMicrophone';
    case 'NotSupportedError':
      return 'unsupported';
    default:
      return 'unknown';
  }
}

/** Opus in WebM for Chromium and Firefox, AAC in MP4 for Safari. */
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

export function pickMimeType(isSupported: (mimeType: string) => boolean): string | undefined {
  return PREFERRED_MIME_TYPES.find((mimeType) => isSupported(mimeType));
}
