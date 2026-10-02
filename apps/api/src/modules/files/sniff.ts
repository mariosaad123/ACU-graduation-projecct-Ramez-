import type { AttachmentKind } from '@acu/shared';

export interface SniffedType {
  contentType: string;
  kind: AttachmentKind;
  extension: string;
}

const startsWith = (data: Buffer, bytes: number[], offset = 0) =>
  data.length >= offset + bytes.length &&
  bytes.every((byte, index) => data[offset + index] === byte);

const ascii = (data: Buffer, text: string, offset = 0) =>
  data.length >= offset + text.length &&
  data.toString('latin1', offset, offset + text.length) === text;

/** Office documents are ZIP files; which one it is comes from the name, checked against a list. */
const OFFICE: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * Identifies an upload from its first bytes. The name and the type the browser claims are not
 * trusted: a script renamed to .jpg is refused. Anything not recognised here is refused too.
 */
export function sniffType(data: Buffer, fileName: string | undefined): SniffedType | null {
  if (startsWith(data, [0xff, 0xd8, 0xff])) {
    return { contentType: 'image/jpeg', kind: 'image', extension: 'jpg' };
  }
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: 'image/png', kind: 'image', extension: 'png' };
  }
  if (ascii(data, 'GIF87a') || ascii(data, 'GIF89a')) {
    return { contentType: 'image/gif', kind: 'image', extension: 'gif' };
  }
  if (ascii(data, 'RIFF') && ascii(data, 'WEBP', 8)) {
    return { contentType: 'image/webp', kind: 'image', extension: 'webp' };
  }
  if (ascii(data, '%PDF-')) {
    return { contentType: 'application/pdf', kind: 'document', extension: 'pdf' };
  }
  if (startsWith(data, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { contentType: 'audio/webm', kind: 'audio', extension: 'webm' };
  }
  if (ascii(data, 'OggS')) {
    return { contentType: 'audio/ogg', kind: 'audio', extension: 'ogg' };
  }
  if (ascii(data, 'RIFF') && ascii(data, 'WAVE', 8)) {
    return { contentType: 'audio/wav', kind: 'audio', extension: 'wav' };
  }
  if (
    ascii(data, 'ID3') ||
    (data.length > 1 && data[0] === 0xff && ((data[1] ?? 0) & 0xe0) === 0xe0)
  ) {
    return { contentType: 'audio/mpeg', kind: 'audio', extension: 'mp3' };
  }
  // MPEG-4 audio, as recorded by Safari: an "ftyp" box with an audio brand.
  if (
    ascii(data, 'ftyp', 4) &&
    ['M4A ', 'mp42', 'isom', 'iso6'].some((brand) => ascii(data, brand, 8))
  ) {
    return { contentType: 'audio/mp4', kind: 'audio', extension: 'm4a' };
  }
  if (startsWith(data, [0x50, 0x4b, 0x03, 0x04])) {
    const extension = fileName?.toLowerCase().split('.').pop() ?? '';
    const contentType = OFFICE[extension];
    return contentType ? { contentType, kind: 'document', extension } : null;
  }
  return null;
}
