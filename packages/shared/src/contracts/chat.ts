import * as z from 'zod/mini';
import { LEARNING_LANGUAGES } from '../languages';
import { GROUP_MEMBER_ROLES, GROUP_ROLES, groupCapabilitiesSchema } from './roles';
import { chatScheduleSchema } from './schedule';

/** Largest attachment accepted in a group chat, and the largest photo before it is resized. */
export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Videos are kept as sent, so they get more room than other attachments. */
export const CHAT_VIDEO_MAX_BYTES = 25 * 1024 * 1024;
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
 * the browser's word: images (re-encoded), videos, PDF, Office documents and recorded audio.
 */
export const ATTACHMENT_KINDS = ['image', 'video', 'audio', 'document'] as const;
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

export const POLL_MAX_OPTIONS = 10;

/** A question with options, asked in a chat message; results update as people vote. */
export const pollSchema = z.object({
  id: z.string(),
  question: z.string(),
  multiple: z.boolean(),
  /** Votes are counted but nobody sees who voted for what. */
  anonymous: z.boolean(),
  closesAt: z.nullable(z.string()),
  closed: z.boolean(),
  options: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      votes: z.number(),
      /** Who chose it; empty for an anonymous poll. */
      voters: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  ),
  /** People who voted at all. */
  voters: z.number(),
  myVotes: z.array(z.string()),
  /** The reader may close it: its author or the group's staff. */
  canClose: z.boolean(),
});
export type Poll = z.infer<typeof pollSchema>;

const pollText = (max: number) => z.string().check(z.trim(), z.minLength(1), z.maxLength(max));

export const createPollSchema = z
  .object({
    question: pollText(300),
    options: z.array(pollText(100)).check(z.minLength(2), z.maxLength(POLL_MAX_OPTIONS)),
    multiple: z.boolean(),
    anonymous: z.boolean(),
    closesAt: z.nullable(z.iso.datetime({ offset: true })),
  })
  .check(
    z.refine(
      (poll) =>
        new Set(poll.options.map((option) => option.toLowerCase())).size === poll.options.length,
      { message: 'Options must differ', path: ['options'] },
    ),
  );
export type CreatePollRequest = z.infer<typeof createPollSchema>;

/** The options someone chooses now; an empty list takes their vote back. */
export const votePollSchema = z.object({
  optionIds: z.array(z.string().check(z.uuid())).check(z.maxLength(POLL_MAX_OPTIONS)),
});

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
    role: z.enum(GROUP_ROLES),
  }),
  /** Null once deleted, or for an attachment sent alone. People are written in it as @[id]. */
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
  /** The names behind each @[id] in the body, for showing them. */
  mentions: z.array(z.object({ id: z.string(), name: z.string() })),
  mentionsAll: z.boolean(),
  /** The reader is mentioned by name or through @all. */
  mentionsMe: z.boolean(),
  poll: z.nullable(pollSchema),
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
  doctor: z.object({ id: z.string(), name: z.string(), avatarUrl: z.nullable(z.string()) }),
  /** The reader owns the group (kept for older screens: role is the full answer). */
  isDoctor: z.boolean(),
  role: z.enum(GROUP_ROLES),
  can: groupCapabilitiesSchema,
  /** Announcements the reader has not seen yet. */
  unreadAnnouncements: z.number(),
  chat: z.object({
    /** Whether students may write right now. When closed, only staff and roles write. */
    open: z.boolean(),
    /** open / closed by the doctor's switch, or following a weekly schedule. */
    mode: z.enum(['open', 'closed', 'scheduled']),
    schedule: z.nullable(chatScheduleSchema),
    /** With a schedule: the doctor opened or closed it by hand until the schedule's next change. */
    manual: z.boolean(),
    /** With a schedule: the next time the chat opens or closes. */
    nextChange: z.nullable(z.object({ at: z.string(), opens: z.boolean() })),
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

export const memberRoleSchema = z.object({ role: z.enum(GROUP_MEMBER_ROLES) });

/** Files shared in a group, for its files tab. */
export const groupFileSchema = z.object({
  attachment: attachmentSchema,
  author: z.object({ id: z.string(), name: z.string() }),
  source: z.enum(['chat', 'announcement']),
  /** The message or announcement it came with. */
  sourceId: z.string(),
  createdAt: z.string(),
});
export type GroupFile = z.infer<typeof groupFileSchema>;

export const groupFilesResponseSchema = z.object({
  files: z.array(groupFileSchema),
  counts: z.object({
    image: z.number(),
    video: z.number(),
    audio: z.number(),
    document: z.number(),
  }),
  hasMore: z.boolean(),
});
export type GroupFilesResponse = z.infer<typeof groupFilesResponseSchema>;
