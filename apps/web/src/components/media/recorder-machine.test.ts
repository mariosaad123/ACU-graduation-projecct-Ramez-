import { describe, expect, it } from 'vitest';
import {
  classifyMediaError,
  initialRecorderState,
  pickMimeType,
  recorderReducer,
  type RecorderState,
} from './recorder-machine';

const blob = new Blob(['audio'], { type: 'audio/webm' });

describe('recorderReducer', () => {
  it('walks through a successful recording', () => {
    const requesting = recorderReducer(initialRecorderState, { type: 'request' });
    const recording = recorderReducer(requesting, { type: 'started', at: 1000 });
    const recorded = recorderReducer(recording, {
      type: 'stopped',
      blob,
      url: 'blob:1',
      durationMs: 4200,
    });

    expect(requesting).toEqual({ status: 'requesting' });
    expect(recording).toEqual({ status: 'recording', startedAt: 1000 });
    expect(recorded).toMatchObject({ status: 'recorded', url: 'blob:1', durationMs: 4200 });
    expect(recorderReducer(recorded, { type: 'reset' })).toEqual({ status: 'idle' });
  });

  it('ignores a second start while already recording', () => {
    const recording: RecorderState = { status: 'recording', startedAt: 1 };
    expect(recorderReducer(recording, { type: 'request' })).toBe(recording);
  });

  it('ignores a stop that arrives without an active recording', () => {
    expect(
      recorderReducer(initialRecorderState, { type: 'stopped', blob, url: 'x', durationMs: 1 }),
    ).toBe(initialRecorderState);
  });

  it('moves to the error state from anywhere and can start over', () => {
    const failed = recorderReducer(
      { status: 'requesting' },
      { type: 'failed', error: 'permissionDenied' },
    );

    expect(failed).toEqual({ status: 'error', error: 'permissionDenied' });
    expect(recorderReducer(failed, { type: 'request' })).toEqual({ status: 'requesting' });
  });
});

describe('classifyMediaError', () => {
  it.each([
    ['NotAllowedError', 'permissionDenied'],
    ['SecurityError', 'permissionDenied'],
    ['NotFoundError', 'noMicrophone'],
    ['OverconstrainedError', 'noMicrophone'],
    ['NotSupportedError', 'unsupported'],
    ['NotReadableError', 'unknown'],
  ])('maps %s to %s', (name, expected) => {
    expect(classifyMediaError(new DOMException('failure', name))).toBe(expected);
  });

  it('treats unexpected values as unknown', () => {
    expect(classifyMediaError('boom')).toBe('unknown');
  });
});

describe('pickMimeType', () => {
  it('prefers Opus in WebM when available', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus');
  });

  it('falls back to MP4 for Safari', () => {
    expect(pickMimeType((type) => type === 'audio/mp4')).toBe('audio/mp4');
  });

  it('returns undefined when nothing is supported', () => {
    expect(pickMimeType(() => false)).toBeUndefined();
  });
});
