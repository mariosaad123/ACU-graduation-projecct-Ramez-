import {
  CHAT_RATE_LIMIT_DEFAULT,
  CHAT_RATE_LIMIT_MAX,
  CHAT_RATE_LIMIT_MIN,
  DOCTOR_STATUSES,
  GROUP_MEMBER_STATUSES,
  FILE_PURPOSES,
  LEARNING_GOALS,
  LEARNING_LANGUAGES,
  USER_ROLES,
} from '@acu/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', USER_ROLES);
export const doctorStatus = pgEnum('doctor_status', DOCTOR_STATUSES);
export const learningLanguage = pgEnum('learning_language', LEARNING_LANGUAGES);
export const learningGoal = pgEnum('learning_goal', LEARNING_GOALS);
export const groupMemberStatus = pgEnum('group_member_status', GROUP_MEMBER_STATUSES);
export const filePurpose = pgEnum('file_purpose', FILE_PURPOSES);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Stable Google account identifier (`sub`); email addresses can change, this cannot. */
  googleSubject: text('google_subject').notNull().unique(),
  email: text('email').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  /** Null until the person chooses how they use the platform. */
  role: userRole('role'),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
  /** Set when the account is suspended; the person cannot sign in until it is cleared. */
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  /** The doctor who suspended the account; null when the faculty administration did. */
  suspendedByUserId: uuid('suspended_by_user_id').references((): AnyPgColumn => users.id, {
    onDelete: 'set null',
  }),
  suspensionReason: text('suspension_reason'),
  /** A photo uploaded here; when null the Google picture in avatar_url is shown. */
  avatarFileId: uuid('avatar_file_id').references((): AnyPgColumn => files.id, {
    onDelete: 'set null',
  }),
  ...timestamps,
});

/** Every language a student has added. Per-language progress (level, placement) will live here. */
export const studentLanguages = pgTable(
  'student_languages',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    language: learningLanguage('language').notNull(),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.language] })],
);

export const studentProfiles = pgTable(
  'student_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The language being studied now. The composite key below keeps it one of the student's own. */
    activeLanguage: learningLanguage('active_language').notNull(),
    goal: learningGoal('goal').notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: 'student_profiles_active_language_fk',
      columns: [table.userId, table.activeLanguage],
      foreignColumns: [studentLanguages.userId, studentLanguages.language],
    }),
  ],
);

export const doctorProfiles = pgTable('doctor_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  staffId: text('staff_id').notNull().unique(),
  displayName: text('display_name').notNull(),
  universityEmail: text('university_email').notNull().unique(),
  status: doctorStatus('status').notNull().default('pending_verification'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  ...timestamps,
});

/** The languages a doctor teaches. Every group is in one of them. */
export const doctorLanguages = pgTable(
  'doctor_languages',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    language: learningLanguage('language').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.language] })],
);

/** A doctor's class or section. Students join it with its code. */
export const groups = pgTable(
  'groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    language: learningLanguage('language').notNull(),
    joinCode: text('join_code').notNull().unique(),
    joinOpen: boolean('join_open').notNull().default(true),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    /** When false only the doctor writes in the chat. */
    chatOpen: boolean('chat_open').notNull().default(true),
    /** Messages each student may send to the chat in a minute. */
    chatRateLimit: integer('chat_rate_limit').notNull().default(CHAT_RATE_LIMIT_DEFAULT),
    photoFileId: uuid('photo_file_id').references((): AnyPgColumn => files.id, {
      onDelete: 'set null',
    }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('groups_doctor_idx').on(table.doctorId),
    check(
      'groups_chat_rate_limit_range',
      sql`${table.chatRateLimit} between ${sql.raw(String(CHAT_RATE_LIMIT_MIN))} and ${sql.raw(String(CHAT_RATE_LIMIT_MAX))}`,
    ),
    // A group is always in a language its doctor teaches.
    foreignKey({
      name: 'groups_doctor_language_fk',
      columns: [table.doctorId, table.language],
      foreignColumns: [doctorLanguages.userId, doctorLanguages.language],
    }),
  ],
);

/** A student's place in a group. Rows are kept after removal, so a doctor can restore them. */
export const groupMembers = pgTable(
  'group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: groupMemberStatus('status').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedByUserId: uuid('removed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Muted by the doctor in the group chat. */
    chatMuted: boolean('chat_muted').notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.studentId] }),
    index('group_members_student_idx').on(table.studentId),
  ],
);

/** Uploaded files. The bytes live in the file storage under storage_key; this row decides access. */
export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
    purpose: filePurpose('purpose').notNull(),
    /** The group a chat attachment or group photo belongs to. */
    groupId: uuid('group_id').references((): AnyPgColumn => groups.id, { onDelete: 'cascade' }),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    originalName: text('original_name'),
    storageKey: text('storage_key').notNull().unique(),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('files_group_idx').on(table.groupId)],
);

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => 'bytea',
  fromDriver: (value) => (Buffer.isBuffer(value) ? value : Buffer.from(value)),
});

/**
 * Uploaded bytes, for hosts whose disk does not survive a restart. Keyed like the disk storage;
 * the `files` row says who may read them.
 */
export const fileBlobs = pgTable('file_blobs', {
  storageKey: text('storage_key').primaryKey(),
  data: bytea('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Every change to a chat message takes the next value, so clients can ask for changes only. */
export const chatVersion = pgSequence('chat_version_seq');

export const groupMessages = pgTable(
  'group_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: bigint('seq', { mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
    version: bigint('version', { mode: 'number' })
      .notNull()
      .default(sql`nextval('chat_version_seq')`),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body'),
    attachmentFileId: uuid('attachment_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    replyToId: uuid('reply_to_id').references((): AnyPgColumn => groupMessages.id, {
      onDelete: 'set null',
    }),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedByUserId: uuid('deleted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('group_messages_group_seq_idx').on(table.groupId, table.seq),
    index('group_messages_group_version_idx').on(table.groupId, table.version),
  ],
);

/** How far each person has read a group's chat, for unread counts. */
export const chatReads = pgTable(
  'chat_reads',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadSeq: bigint('last_read_seq', { mode: 'number' }).notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.userId] })],
);

/** The shared code that proves someone is faculty staff. Only an Argon2 hash is stored. */
export const doctorAccessCodes = pgTable('doctor_access_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  codeHash: text('code_hash').notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const emailVerifications = pgTable(
  'email_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    purpose: text('purpose', { enum: ['doctor_university_email'] }).notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [index('email_verifications_user_purpose_idx').on(table.userId, table.purpose)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the cookie token, so a database leak does not expose live sessions. */
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_idx').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
  ],
);

/** Short-lived state of a sign-in that is on its way to Google and back. */
export const authFlows = pgTable('auth_flows', {
  id: uuid('id').primaryKey().defaultRandom(),
  state: text('state').notNull(),
  nonce: text('nonce').notNull(),
  codeVerifier: text('code_verifier').notNull(),
  returnTo: text('return_to'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_events_actor_action_created_idx').on(
      table.actorUserId,
      table.action,
      table.createdAt,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type DoctorProfile = typeof doctorProfiles.$inferSelect;
export type StudentProfile = typeof studentProfiles.$inferSelect;
export type StudentLanguage = typeof studentLanguages.$inferSelect;
export type DoctorLanguage = typeof doctorLanguages.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type GroupMessage = typeof groupMessages.$inferSelect;
