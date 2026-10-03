import * as z from 'zod/mini';
import { LEARNING_LANGUAGES } from '../languages';
import { sessionUserSchema } from './auth';
import { CHAT_RATE_LIMIT_MAX, CHAT_RATE_LIMIT_MIN } from './chat';
import { GROUP_MEMBER_ROLES, GROUP_ROLES } from './roles';
import { chatScheduleSchema } from './schedule';

const learningLanguage = z.enum(LEARNING_LANGUAGES);

/**
 * Join codes use Crockford's base 32 without 0, 1 and the letters it already leaves out (I, L,
 * O, U), so nothing can be misread when a doctor writes a code on the board: 30 symbols, 8 long.
 */
export const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const JOIN_CODE_LENGTH = 8;

const JOIN_CODE_PATTERN = new RegExp(`^[${JOIN_CODE_ALPHABET}]{${String(JOIN_CODE_LENGTH)}}$`);

/** Accepts what people type or paste: any case, with spaces or dashes. Null if it cannot be one. */
export function normalizeJoinCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return JOIN_CODE_PATTERN.test(code) ? code : null;
}

/** "K7QM9XRT" becomes "K7QM-9XRT", easier to read aloud and to copy by hand. */
export function formatJoinCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * pending: waiting for the doctor's approval · active: in the group · removed: taken out, or
 * refused, by the doctor · left: the student left on their own.
 */
export const GROUP_MEMBER_STATUSES = ['pending', 'active', 'removed', 'left'] as const;
export type GroupMemberStatus = (typeof GROUP_MEMBER_STATUSES)[number];

const trimmed = (min: number, max: number) =>
  z.string().check(z.trim(), z.minLength(min), z.maxLength(max));

/** An empty description is stored as none. */
const description = z.pipe(
  z.nullable(z.string().check(z.trim(), z.maxLength(300))),
  z.transform((value) => (value === '' ? null : value)),
);

export const groupCreateSchema = z.object({
  name: trimmed(3, 80),
  description: z.optional(description),
  language: learningLanguage,
  requiresApproval: z.optional(z.boolean()),
});
export type GroupCreateRequest = z.infer<typeof groupCreateSchema>;

/** The language of a group never changes: its members joined it for that language. */
export const groupUpdateSchema = z.object({
  name: z.optional(trimmed(3, 80)),
  description: z.optional(description),
  joinOpen: z.optional(z.boolean()),
  requiresApproval: z.optional(z.boolean()),
  chatOpen: z.optional(z.boolean()),
  /** Messages each student may send in a minute. */
  chatRateLimit: z.optional(z.int().check(z.gte(CHAT_RATE_LIMIT_MIN), z.lte(CHAT_RATE_LIMIT_MAX))),
  /** Weekly windows when the chat opens by itself; null goes back to the open/closed switch. */
  chatSchedule: z.optional(z.nullable(chatScheduleSchema)),
});
export type GroupUpdateRequest = z.infer<typeof groupUpdateSchema>;

export const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.nullable(z.string()),
  language: learningLanguage,
  joinCode: z.string(),
  joinOpen: z.boolean(),
  requiresApproval: z.boolean(),
  chatOpen: z.boolean(),
  chatRateLimit: z.number(),
  chatSchedule: z.nullable(chatScheduleSchema),
  photoUrl: z.nullable(z.string()),
  archived: z.boolean(),
  createdAt: z.string(),
  counts: z.object({ active: z.number(), pending: z.number(), out: z.number() }),
  /** Chat messages the doctor has not read yet. */
  unread: z.number(),
});
export type Group = z.infer<typeof groupSchema>;

export const groupResponseSchema = z.object({ group: groupSchema });
export const groupsResponseSchema = z.object({ groups: z.array(groupSchema) });

/** What a doctor sees of a student in one of their groups. */
export const groupMemberSchema = z.object({
  student: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    avatarUrl: z.nullable(z.string()),
    languages: z.array(learningLanguage),
    activeLanguage: z.nullable(learningLanguage),
    suspension: z.nullable(
      z.object({
        byMe: z.boolean(),
        /** The doctor's display name; null when the faculty administration suspended the account. */
        byName: z.nullable(z.string()),
        reason: z.nullable(z.string()),
        at: z.string(),
      }),
    ),
  }),
  status: z.enum(GROUP_MEMBER_STATUSES),
  /** Muted in the group chat: reads, does not write. */
  chatMuted: z.boolean(),
  role: z.enum(GROUP_MEMBER_ROLES),
  joinedAt: z.string(),
  decidedAt: z.nullable(z.string()),
  removedAt: z.nullable(z.string()),
  /** True when the student left on their own rather than being removed. */
  leftByThemselves: z.boolean(),
});
export type GroupMember = z.infer<typeof groupMemberSchema>;

export const groupMemberResponseSchema = z.object({ member: groupMemberSchema });
export const groupMembersResponseSchema = z.object({ members: z.array(groupMemberSchema) });

export const addMemberSchema = z.object({
  email: z.string().check(z.trim(), z.toLowerCase(), z.maxLength(254), z.email()),
});
export type AddMemberRequest = z.infer<typeof addMemberSchema>;

export const moveMemberSchema = z.object({ toGroupId: z.string().check(z.uuid()) });
export type MoveMemberRequest = z.infer<typeof moveMemberSchema>;

export const suspendStudentSchema = z.object({ reason: trimmed(3, 300) });
export type SuspendStudentRequest = z.infer<typeof suspendStudentSchema>;

/** What a student sees of a group in their list; the classmates are on the group's own page. */
export const studentGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.nullable(z.string()),
  language: learningLanguage,
  photoUrl: z.nullable(z.string()),
  doctorName: z.string(),
  doctorAvatarUrl: z.nullable(z.string()),
  status: z.enum(['pending', 'active']),
  joinedAt: z.string(),
  unread: z.number(),
  unreadAnnouncements: z.number(),
  role: z.enum(GROUP_MEMBER_ROLES),
});
export type StudentGroup = z.infer<typeof studentGroupSchema>;

export const studentGroupsResponseSchema = z.object({ groups: z.array(studentGroupSchema) });

export const joinCodeSchema = z.object({ code: z.string().check(z.maxLength(40)) });
export type JoinCodeRequest = z.infer<typeof joinCodeSchema>;

/** Shown before a student confirms joining. */
export const joinPreviewSchema = z.object({
  group: z.object({
    name: z.string(),
    description: z.nullable(z.string()),
    language: learningLanguage,
    photoUrl: z.nullable(z.string()),
    doctorName: z.string(),
    doctorAvatarUrl: z.nullable(z.string()),
    requiresApproval: z.boolean(),
  }),
  /** The student's membership if they already have one. */
  membership: z.nullable(z.enum(['pending', 'active'])),
});
export type JoinPreview = z.infer<typeof joinPreviewSchema>;

export const joinResultSchema = z.object({
  status: z.enum(['pending', 'active']),
  /** True when the group's language was added to the student's languages. */
  languageAdded: z.boolean(),
  user: sessionUserSchema,
});
export type JoinResult = z.infer<typeof joinResultSchema>;

/** A teaching assistant: another doctor account helping run the group. */
export const assistantSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  avatarUrl: z.nullable(z.string()),
  addedAt: z.string(),
});
export type Assistant = z.infer<typeof assistantSchema>;

export const assistantsResponseSchema = z.object({ assistants: z.array(assistantSchema) });
export const assistantResponseSchema = z.object({ assistant: assistantSchema });

/** The doctor account's sign-in or university email. */
export const addAssistantSchema = z.object({
  email: z.string().check(z.trim(), z.toLowerCase(), z.maxLength(254), z.email()),
});

/** A group a doctor helps run as a teaching assistant, for their dashboard. */
export const assistedGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  language: learningLanguage,
  photoUrl: z.nullable(z.string()),
  doctorName: z.string(),
  archived: z.boolean(),
  students: z.number(),
  unread: z.number(),
  role: z.enum(GROUP_ROLES),
});
export type AssistedGroup = z.infer<typeof assistedGroupSchema>;

export const assistedGroupsResponseSchema = z.object({ groups: z.array(assistedGroupSchema) });
