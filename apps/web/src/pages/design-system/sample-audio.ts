const SAMPLE_RATE = 22_050;

let cachedUrl: string | undefined;

/**
 * A short synthesised chime (C–E–G–C), so the audio player can be shown without shipping a file.
 * Returned as a data URL: unlike a blob URL it never has to be revoked, so remounts cannot break it.
 */
export function getSampleAudioUrl(): string {
  cachedUrl ??= `data:audio/wav;base64,${toBase64(synthesiseChime())}`;
  return cachedUrl;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function synthesiseChime(): ArrayBuffer {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const noteSeconds = 0.9;
  const totalSamples = Math.floor(notes.length * noteSeconds * SAMPLE_RATE);
  const pcm = new Int16Array(totalSamples);

  notes.forEach((frequency, noteIndex) => {
    const offset = Math.floor(noteIndex * noteSeconds * SAMPLE_RATE);
    const length = Math.floor(noteSeconds * SAMPLE_RATE);
    for (let sample = 0; sample < length; sample += 1) {
      const time = sample / SAMPLE_RATE;
      const envelope = Math.min(time * 40, 1) * Math.exp(-3 * time);
      const value = Math.sin(2 * Math.PI * frequency * time) * envelope * 0.35;
      pcm[offset + sample] = Math.round(value * 32_767);
    }
  });

  return encodeWav(pcm);
}

function encodeWav(samples: Int16Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    view.setInt16(44 + index * 2, sample, true);
  });

  return buffer;
}
