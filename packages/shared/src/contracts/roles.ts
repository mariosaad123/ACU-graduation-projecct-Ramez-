import * as z from 'zod/mini';

/**
 * What a student can be in a group besides a member: a moderator keeps the chat in order, a
 * representative (the class's spokesperson) posts announcements.
 */
export const GROUP_MEMBER_ROLES = ['student', 'moderator', 'representative'] as const;
export type GroupMemberRole = (typeof GROUP_MEMBER_ROLES)[number];

/**
 * Everyone's place in a group: its doctor (the owner), a teaching assistant (another doctor
 * account), or a student with one of the member roles.
 */
export const GROUP_ROLES = ['owner', 'assistant', ...GROUP_MEMBER_ROLES] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

/** What each role may do. The API checks these; the web app only uses them to show or hide. */
export interface GroupCapabilities {
  /** Writes even while the chat is closed to students. */
  postWhenClosed: boolean;
  pin: boolean;
  /** Deletes other people's messages (a moderator: students' messages only). */
  moderate: boolean;
  announce: boolean;
  createPolls: boolean;
  mentionAll: boolean;
  mute: boolean;
  /** Grades, activity and exports. */
  teach: boolean;
  /** Settings, members, roles and assistants. */
  manage: boolean;
}

const NONE: GroupCapabilities = {
  postWhenClosed: false,
  pin: false,
  moderate: false,
  announce: false,
  createPolls: false,
  mentionAll: false,
  mute: false,
  teach: false,
  manage: false,
};

export const CAPABILITIES: Record<GroupRole, GroupCapabilities> = {
  owner: {
    postWhenClosed: true,
    pin: true,
    moderate: true,
    announce: true,
    createPolls: true,
    mentionAll: true,
    mute: true,
    teach: true,
    manage: true,
  },
  assistant: {
    postWhenClosed: true,
    pin: true,
    moderate: true,
    announce: true,
    createPolls: true,
    mentionAll: true,
    mute: true,
    teach: true,
    manage: false,
  },
  moderator: {
    ...NONE,
    postWhenClosed: true,
    pin: true,
    moderate: true,
    createPolls: true,
    mentionAll: true,
  },
  representative: {
    ...NONE,
    postWhenClosed: true,
    announce: true,
    createPolls: true,
    mentionAll: true,
  },
  student: NONE,
};

/** The doctor and teaching assistants: the group's staff. */
export function isStaff(role: GroupRole): boolean {
  return role === 'owner' || role === 'assistant';
}

export const groupCapabilitiesSchema = z.object({
  postWhenClosed: z.boolean(),
  pin: z.boolean(),
  moderate: z.boolean(),
  announce: z.boolean(),
  createPolls: z.boolean(),
  mentionAll: z.boolean(),
  mute: z.boolean(),
  teach: z.boolean(),
  manage: z.boolean(),
});
