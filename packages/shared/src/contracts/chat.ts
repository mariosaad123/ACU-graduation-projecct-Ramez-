import * as z from 'zod/mini';
import { LEARNING_LANGUAGES } from '../languages';

/** Largest attachment accepted in a group chat, and the largest photo before it is resized. */
export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_MESSAGE_MAX_LENGTH = 4000;

/**
 * How many messages a student may send to a group in a minute. Each doctor sets it for each group;
 * the ceiling keeps one person from flooding everyone else. The doctor's own limit is the ceiling.
 */
export const CHAT_RATE_LIMIT_DEFAULT = 60;
export const CHAT_RATE_LIMIT_MIN = 1;
export const CHAT_RATE_LIMIT_MAX = 120;

/** Why a file was uploaded, which decides who may download it. */
export const FILE_PURPOSES = ['avatar', 'group_photo', 'chat'] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

/**
 * What can be attached, checked on the server from the file's first bytes, never from its name or
 * the browser's word: images (re-encoded), PDF, Office documents and recorded audio.
 */
export const ATTACHMENT_KINDS = ['image', 'audio', 'document'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const attachmentSchema = z.object({
  id: z.string(),
  url: z.string(),
  kind: z.enum(ATTACHMENT_KINDS),
  name: z.nullable(z.string()),
  contentType: z.string(),
  size: z.number(),
  width: z.nullable(z.number()),
  height: z.nullable(z.number()),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  /** Order of the message in its group. */
  seq: z.number(),
  /** Grows with every change (new, edited, deleted, pinned), so polling asks only for changes. */
  version: z.number(),
  author: z.object({
    id: z.string(),
    name: z.string(),
    avatarUrl: z.nullable(z.string()),
    isDoctor: z.boolean(),
  }),
  /** Null once deleted, or for an attachment sent alone. */
  body: z.nullable(z.string()),
  attachment: z.nullable(attachmentSchema),
  replyTo: z.nullable(
    z.object({
      id: z.string(),
      authorName: z.string(),
      /** The start of the quoted message; null when it was deleted. */
      excerpt: z.nullable(z.string()),
      hasAttachment: z.boolean(),
    }),
  ),
  pinned: z.boolean(),
  edited: z.boolean(),
  deleted: z.boolean(),
  mine: z.boolean(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** A group as its doctor or one of its students sees it, with what they may do in its chat. */
export const groupViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.nullable(z.string()),
  language: z.enum(LEARNING_LANGUAGES),
  photoUrl: z.nullable(z.string()),
  archived: z.boolean(),
  doctor: z.object({ name: z.string(), avatarUrl: z.nullable(z.string()) }),
  isDoctor: z.boolean(),
  chat: z.object({
    /** When closed, only the doctor writes: the chat becomes an announcement board. */
    open: z.boolean(),
    /** The student was muted by the doctor: they read but do not write. */
    muted: z.boolean(),
    canPost: z.boolean(),
    lastReadSeq: z.number(),
    /** Messages this person may send in a minute. */
    rateLimit: z.number(),
  }),
});
export type GroupView = z.infer<typeof groupViewSchema>;

export const groupViewResponseSchema = z.object({ group: groupViewSchema });

export const chatPageSchema = z.object({
  messages: z.array(chatMessageSchema),
  /** Pinned messages, even when they are older than the page. */
  pinned: z.array(chatMessageSchema),
  /** The highest version the server knows; the next poll asks for anything after it. */
  version: z.number(),
  /** True when there are older messages to load. */
  hasOlder: z.boolean(),
});
export type ChatPage = z.infer<typeof chatPageSchema>;

export const chatChangesSchema = z.object({
  messages: z.array(chatMessageSchema),
  version: z.number(),
});
export type ChatChanges = z.infer<typeof chatChangesSchema>;

export const chatMessageResponseSchema = z.object({ message: chatMessageSchema });

export const editMessageSchema = z.object({
  body: z.string().check(z.trim(), z.minLength(1), z.maxLength(CHAT_MESSAGE_MAX_LENGTH)),
});

export const markReadSchema = z.object({ seq: z.number().check(z.int(), z.nonnegative()) });

export const chatMuteSchema = z.object({ muted: z.boolean() });
