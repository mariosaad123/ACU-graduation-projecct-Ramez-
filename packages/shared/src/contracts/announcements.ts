import * as z from 'zod/mini';
import { attachmentSchema } from './chat';
import { GROUP_ROLES } from './roles';

export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 120;
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 4000;
export const ANNOUNCEMENT_MAX_ATTACHMENTS = 5;

export const announcementSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  important: z.boolean(),
  author: z.object({
    id: z.string(),
    name: z.string(),
    avatarUrl: z.nullable(z.string()),
    role: z.enum(GROUP_ROLES),
  }),
  attachments: z.array(attachmentSchema),
  createdAt: z.string(),
  edited: z.boolean(),
  /** The reader has seen it. */
  read: z.boolean(),
  /** For the staff and the author: how many of the group's students have seen it. */
  receipts: z.nullable(z.object({ read: z.number(), total: z.number() })),
  /** The reader may edit or delete it: its author or the group's doctor. */
  canEdit: z.boolean(),
});
export type Announcement = z.infer<typeof announcementSchema>;

export const announcementsResponseSchema = z.object({
  announcements: z.array(announcementSchema),
});
export const announcementResponseSchema = z.object({ announcement: announcementSchema });

const title = z
  .string()
  .check(z.trim(), z.minLength(1), z.maxLength(ANNOUNCEMENT_TITLE_MAX_LENGTH));
const body = z.string().check(z.trim(), z.minLength(1), z.maxLength(ANNOUNCEMENT_BODY_MAX_LENGTH));

/** Sent as multipart form fields with up to five files; "important" is "true" or absent. */
export const announcementFieldsSchema = z.object({
  title,
  body,
  important: z.optional(z.enum(['true', 'false'])),
});

export const editAnnouncementSchema = z.object({
  title: z.optional(title),
  body: z.optional(body),
  important: z.optional(z.boolean()),
});

export const markAnnouncementsReadSchema = z.object({
  ids: z.array(z.string().check(z.uuid())).check(z.minLength(1), z.maxLength(100)),
});

const reader = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.nullable(z.string()),
});

/** Who has seen an announcement and who has not, among the group's active students. */
export const announcementReceiptsSchema = z.object({
  read: z.array(z.object({ ...reader.shape, readAt: z.string() })),
  unread: z.array(reader),
});
export type AnnouncementReceipts = z.infer<typeof announcementReceiptsSchema>;
