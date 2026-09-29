import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  classifyMediaError,
  initialRecorderState,
  pickMimeType,
  recorderReducer,
  type RecorderState,
} from './recorder-machine';

interface VoiceRecorderOptions {
  maxDurationMs: number;
  onRecorded?: (blob: Blob) => void;
}

export interface VoiceRecorderControls {
  state: RecorderState;
  elapsedMs: number;
  /** Input loudness between 0 and 1, updated while recording. */
  level: number;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

const LEVEL_UPDATE_INTERVAL_MS = 60;

export function useVoiceRecorder({
  maxDurationMs,
  onRecorded,
}: VoiceRecorderOptions): VoiceRecorderControls {
  const [state, dispatch] = useReducer(recorderReducer, initialRecorderState);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const tickRef = useRef<number | undefined>(undefined);
  const limitRef = useRef<number | undefined>(undefined);
  const urlRef = useRef<string | null>(null);
  /** Set when a recording in flight should be thrown away (reset or unmount), as `stop` fires asynchronously. */
  const discardRef = useRef(false);
  const onRecordedRef = useRef(onRecorded);

  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  const releaseDevices = useCallback(() => {
    window.clearInterval(tickRef.current);
    window.clearTimeout(limitRef.current);
    if (frameRef.current !== undefined) {
      cancelAnimationFrame(frameRef.current);
    }
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    setLevel(0);
  }, []);

  const revokeRecording = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const watchLevel = useCallback((stream: MediaStream) => {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = context;

    const samples = new Float32Array(analyser.fftSize);
    let lastUpdate = 0;

    const measure = (time: number) => {
      if (time - lastUpdate >= LEVEL_UPDATE_INTERVAL_MS) {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(
          samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length,
        );
        setLevel(Math.min(rms * 4, 1));
        lastUpdate = time;
      }
      frameRef.current = requestAnimationFrame(measure);
    };
    frameRef.current = requestAnimationFrame(measure);
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    if (!window.isSecureContext) {
      dispatch({ type: 'failed', error: 'insecureContext' });
      return;
    }
    if (typeof MediaRecorder === 'undefined' || !('mediaDevices' in navigator)) {
      dispatch({ type: 'failed', error: 'unsupported' });
      return;
    }

    revokeRecording();
    discardRef.current = false;
    setElapsedMs(0);
    dispatch({ type: 'request' });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      dispatch({ type: 'failed', error: classifyMediaError(error) });
      return;
    }

    const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const startedAt = performance.now();

    streamRef.current = stream;
    recorderRef.current = recorder;

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    recorder.addEventListener('stop', () => {
      releaseDevices();
      if (discardRef.current) {
        return;
      }
      const durationMs = performance.now() - startedAt;
      // Some browsers report an empty mimeType; fall back to the one we asked for.
      const type = recorder.mimeType !== '' ? recorder.mimeType : (mimeType ?? 'audio/webm');
      const blob = new Blob(chunks, { type });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setElapsedMs(Math.min(durationMs, maxDurationMs));
      dispatch({ type: 'stopped', blob, url, durationMs });
      onRecordedRef.current?.(blob);
    });

    recorder.addEventListener('error', () => {
      releaseDevices();
      dispatch({ type: 'failed', error: 'unknown' });
    });

    recorder.start(250);
    dispatch({ type: 'started', at: Date.now() });
    watchLevel(stream);

    tickRef.current = window.setInterval(() => {
      setElapsedMs(Math.min(performance.now() - startedAt, maxDurationMs));
    }, 200);
    limitRef.current = window.setTimeout(stop, maxDurationMs);
  }, [maxDurationMs, releaseDevices, revokeRecording, stop, watchLevel]);

  const reset = useCallback(() => {
    discardRef.current = true;
    stop();
    revokeRecording();
    setElapsedMs(0);
    dispatch({ type: 'reset' });
  }, [revokeRecording, stop]);

  useEffect(
    () => () => {
      discardRef.current = true;
      const recorder = recorderRef.current;
      if (recorder?.state === 'recording') {
        recorder.stop();
      }
      releaseDevices();
      revokeRecording();
    },
    [releaseDevices, revokeRecording],
  );

  return { state, elapsedMs, level, start, stop, reset };
}
