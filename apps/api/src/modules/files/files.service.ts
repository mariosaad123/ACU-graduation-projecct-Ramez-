import { randomUUID } from 'node:crypto';
import { CHAT_ATTACHMENT_MAX_BYTES, type Attachment, type FilePurpose } from '@acu/shared';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Database } from '../../db/client';
import { files, type FileRow, type User } from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { groupAccess } from '../groups/access';
import type { FileStorage } from './storage';
import { sniffType } from './sniff';

export interface FilesContext {
  db: Database;
  storage: FileStorage;
}

export interface Upload {
  buffer: Buffer;
  originalName: string | undefined;
  /** What the browser said the file is; only used to tell audio from video in the same container. */
  declaredType?: string;
}

/** How each kind of image is stored: profile and group photos are square, chat images fit a box. */
const IMAGE_SHAPES: Record<FilePurpose, { size: number; square: boolean }> = {
  avatar: { size: 256, square: true },
  group_photo: { size: 512, square: true },
  chat: { size: 1600, square: false },
  submission: { size: 2000, square: false },
};

/** Beyond this an image is refused before it is decoded (a "decompression bomb"). */
const MAX_INPUT_PIXELS = 40_000_000;

export function fileUrl(id: string): string {
  return `/api/files/${id}`;
}

function unsupported(): HttpError {
  return new HttpError(415, 'UNSUPPORTED_FILE', 'This type of file is not accepted');
}

/**
 * Re-encodes an image: turned upright from its camera orientation, resized, and written again as
 * WebP. Nothing of the original file survives, including hidden data such as GPS coordinates.
 */
async function processImage(data: Buffer, purpose: FilePurpose) {
  const shape = IMAGE_SHAPES[purpose];
  try {
    const pipeline = sharp(data, {
      animated: purpose === 'chat' || purpose === 'submission',
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize(
        shape.square
          ? { width: shape.size, height: shape.size, fit: 'cover' }
          : { width: shape.size, height: shape.size, fit: 'inside', withoutEnlargement: true },
      );
    const { data: output, info } = await pipeline
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { output, width: info.width, height: info.pageHeight ?? info.height };
  } catch {
    throw unsupported();
  }
}

/** Keeps a readable name for downloads, without paths or control characters. */
function cleanName(name: string | undefined): string | null {
  const base = name
    ?.split(/[\\/]/)
    .pop()
    ?.replace(/\p{Cc}/gu, '')
    .trim();
  return base ? base.slice(0, 120) : null;
}

/** Checks, processes and stores an upload, then records who owns it and what it is for. */
export async function saveUpload(
  context: FilesContext,
  owner: User,
  upload: Upload,
  purpose: FilePurpose,
  groupId: string | null = null,
): Promise<FileRow> {
  const sniffed = sniffType(upload.buffer, upload.originalName, upload.declaredType);
  const anyKind = purpose === 'chat' || purpose === 'submission';
  if (!sniffed || (!anyKind && sniffed.kind !== 'image')) {
    throw unsupported();
  }
  // Videos may be larger; the route already stopped anything beyond their limit.
  if (sniffed.kind !== 'video' && upload.buffer.length > CHAT_ATTACHMENT_MAX_BYTES) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'The file is too large', {
      details: { maxBytes: CHAT_ATTACHMENT_MAX_BYTES },
    });
  }

  let data = upload.buffer;
  let contentType = sniffed.contentType;
  let extension = sniffed.extension;
  let width: number | null = null;
  let height: number | null = null;
  if (sniffed.kind === 'image') {
    const image = await processImage(upload.buffer, purpose);
    data = image.output;
    contentType = 'image/webp';
    extension = 'webp';
    width = image.width;
    height = image.height;
  }

  const storageKey = `${randomUUID()}.${extension}`;
  await context.storage.put(storageKey, data);
  try {
    const [row] = await context.db
      .insert(files)
      .values({
        ownerId: owner.id,
        purpose,
        groupId,
        contentType,
        byteSize: data.length,
        originalName: sniffed.kind === 'image' ? null : cleanName(upload.originalName),
        storageKey,
        width,
        height,
      })
      .returning();
    if (!row) {
      throw new Error('File row was not created');
    }
    return row;
  } catch (error) {
    await context.storage.remove(storageKey);
    throw error;
  }
}

/** Removes the row first, so nothing points at bytes that are gone. */
export async function removeFile(context: FilesContext, fileId: string | null): Promise<void> {
  if (!fileId) {
    return;
  }
  const [removed] = await context.db.delete(files).where(eq(files.id, fileId)).returning();
  if (removed) {
    await context.storage.remove(removed.storageKey);
  }
}

/**
 * A file the user may see. Profile and group photos are visible to anyone signed in; a file shared
 * in a group only to its staff and current members. Anything else looks missing.
 */
export async function readFileFor(
  context: FilesContext,
  user: User,
  fileId: string,
): Promise<{ row: FileRow; data: Buffer }> {
  const missing = new HttpError(404, 'NOT_FOUND', 'File not found');
  const [row] = await context.db.select().from(files).where(eq(files.id, fileId));
  if (!row) {
    throw missing;
  }

  if (row.purpose === 'chat') {
    // Anyone who may read the group's chat and announcements may open what was shared there.
    if (!row.groupId) {
      throw missing;
    }
    try {
      await groupAccess(context.db, user, row.groupId);
    } catch {
      throw missing;
    }
  }

  if (row.purpose === 'submission') {
    // Handed-in work is between its student and the group's staff.
    if (!row.groupId) {
      throw missing;
    }
    if (row.ownerId !== user.id) {
      try {
        const access = await groupAccess(context.db, user, row.groupId);
        if (!access.can.teach) {
          throw missing;
        }
      } catch {
        throw missing;
      }
    }
  }

  const data = await context.storage.read(row.storageKey);
  if (!data) {
    throw missing;
  }
  return { row, data };
}

export function kindOf(contentType: string): Attachment['kind'] {
  if (contentType.startsWith('image/')) {
    return 'image';
  }
  if (contentType.startsWith('video/')) {
    return 'video';
  }
  return contentType.startsWith('audio/') ? 'audio' : 'document';
}

export function toAttachment(row: FileRow): Attachment {
  const kind = kindOf(row.contentType);
  return {
    id: row.id,
    url: fileUrl(row.id),
    kind,
    name: row.originalName,
    contentType: row.contentType,
    size: row.byteSize,
    width: row.width,
    height: row.height,
  };
}
