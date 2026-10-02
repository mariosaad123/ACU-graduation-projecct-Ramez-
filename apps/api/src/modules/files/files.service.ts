import { randomUUID } from 'node:crypto';
import type { Attachment, FilePurpose } from '@acu/shared';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import type { Database } from '../../db/client';
import { files, groupMembers, groups, type FileRow, type User } from '../../db/schema';
import { HttpError } from '../../http/http-error';
import type { FileStorage } from './storage';
import { sniffType } from './sniff';

export interface FilesContext {
  db: Database;
  storage: FileStorage;
}

export interface Upload {
  buffer: Buffer;
  originalName: string | undefined;
}

/** How each kind of image is stored: profile and group photos are square, chat images fit a box. */
const IMAGE_SHAPES: Record<FilePurpose, { size: number; square: boolean }> = {
  avatar: { size: 256, square: true },
  group_photo: { size: 512, square: true },
  chat: { size: 1600, square: false },
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
      animated: purpose === 'chat',
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
  const sniffed = sniffType(upload.buffer, upload.originalName);
  if (!sniffed || (purpose !== 'chat' && sniffed.kind !== 'image')) {
    throw unsupported();
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
 * A file the user may see. Profile and group photos are visible to anyone signed in; a chat
 * attachment only to the group's doctor and its current members. Anything else looks missing.
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
    if (!row.groupId) {
      throw missing;
    }
    const [group] = await context.db
      .select({ doctorId: groups.doctorId })
      .from(groups)
      .where(eq(groups.id, row.groupId));
    const [membership] = await context.db
      .select({ status: groupMembers.status })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, row.groupId),
          eq(groupMembers.studentId, user.id),
          inArray(groupMembers.status, ['active']),
        ),
      );
    if (group?.doctorId !== user.id && !membership) {
      throw missing;
    }
  }

  const data = await context.storage.read(row.storageKey);
  if (!data) {
    throw missing;
  }
  return { row, data };
}

export function toAttachment(row: FileRow): Attachment {
  const kind = row.contentType.startsWith('image/')
    ? 'image'
    : row.contentType.startsWith('audio/')
      ? 'audio'
      : 'document';
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
