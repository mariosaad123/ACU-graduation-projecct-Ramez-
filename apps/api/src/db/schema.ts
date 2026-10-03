import {
  CHAT_RATE_LIMIT_DEFAULT,
  CHAT_RATE_LIMIT_MAX,
  CHAT_RATE_LIMIT_MIN,
  ASSIGNMENT_KINDS,
  DOCTOR_STATUSES,
  GRADE_COLUMN_KINDS,
  GRADE_COLUMN_SOURCES,
  GRADE_STATUSES,
  GROUP_MEMBER_ROLES,
  GROUP_MEMBER_STATUSES,
  FILE_PURPOSES,
  LEARNING_GOALS,
  LEARNING_LANGUAGES,
  NOTIFICATION_KINDS,
  USER_ROLES,
  type ChatSchedule,
} from '@acu/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
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
export const groupMemberRole = pgEnum('group_member_role', GROUP_MEMBER_ROLES);
export const gradeColumnKind = pgEnum('grade_column_kind', GRADE_COLUMN_KINDS);
export const gradeStatus = pgEnum('grade_status', GRADE_STATUSES);
export const notificationKind = pgEnum('notification_kind', NOTIFICATION_KINDS);

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
    /**
     * The university's student number, upper-cased; one account each. Null only for accounts
     * created before it was required, which are asked for it at their next visit.
     */
    universityId: text('university_id').unique('student_profiles_university_id_key'),
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
    /** When set, the chat opens to students inside these weekly windows only (Cairo time). */
    chatSchedule: jsonb('chat_schedule').$type<ChatSchedule>(),
    /**
     * With a schedule, the doctor can still open or close the chat by hand: that choice holds
     * until the schedule's next change, then the schedule takes over again.
     */
    chatOverrideOpen: boolean('chat_override_open'),
    chatOverrideUntil: timestamp('chat_override_until', { withTimezone: true }),
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
    role: groupMemberRole('role').notNull().default('student'),
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
    /** People mentioned in the body as @[id]; @[all] sets mentions_all. */
    mentions: uuid('mentions')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    mentionsAll: boolean('mentions_all').notNull().default(false),
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
    /** When the person last opened the group, for the activity the staff see. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.userId] })],
);

/** Teaching assistants: other doctor accounts who help run a group, without its settings. */
export const groupAssistants = pgTable(
  'group_assistants',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index('group_assistants_user_idx').on(table.userId),
  ],
);

/** Official notices, apart from the chat, with who has read them. */
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    important: boolean('important').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('announcements_group_idx').on(table.groupId, table.createdAt)],
);

export const announcementAttachments = pgTable(
  'announcement_attachments',
  {
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .unique()
      .references(() => files.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (table) => [primaryKey({ columns: [table.announcementId, table.fileId] })],
);

export const announcementReads = pgTable(
  'announcement_reads',
  {
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.announcementId, table.userId] }),
    index('announcement_reads_user_idx').on(table.userId),
  ],
);

/** A question asked in the chat; it lives in one chat message. */
export const polls = pgTable('polls', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id')
    .notNull()
    .unique()
    .references(() => groupMessages.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  multiple: boolean('multiple').notNull().default(false),
  anonymous: boolean('anonymous').notNull().default(false),
  closesAt: timestamp('closes_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pollOptions = pgTable(
  'poll_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [index('poll_options_poll_idx').on(table.pollId)],
);

export const pollVotes = pgTable(
  'poll_votes',
  {
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => pollOptions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    votedAt: timestamp('voted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.optionId, table.userId] }),
    index('poll_votes_poll_user_idx').on(table.pollId, table.userId),
  ],
);

/** The gradebook's columns: a quiz, an assignment, an exam... */
export const gradeColumns = pgTable(
  'grade_columns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: gradeColumnKind('kind').notNull(),
    maxScore: numeric('max_score', { precision: 7, scale: 2, mode: 'number' }).notNull(),
    weight: numeric('weight', { precision: 5, scale: 2, mode: 'number' }),
    heldOn: date('held_on', { mode: 'string' }),
    published: boolean('published').notNull().default(false),
    position: integer('position').notNull(),
    /** Typed by the staff, or filled by grading work handed in on the platform. */
    source: text('source', { enum: GRADE_COLUMN_SOURCES }).notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('grade_columns_group_idx').on(table.groupId),
    check('grade_columns_max_score_positive', sql`${table.maxScore} > 0`),
    check(
      'grade_columns_weight_range',
      sql`${table.weight} is null or (${table.weight} > 0 and ${table.weight} <= 100)`,
    ),
  ],
);

export const grades = pgTable(
  'grades',
  {
    columnId: uuid('column_id')
      .notNull()
      .references(() => gradeColumns.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: gradeStatus('status').notNull().default('scored'),
    score: numeric('score', { precision: 7, scale: 2, mode: 'number' }),
    note: text('note'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    primaryKey({ columns: [table.columnId, table.studentId] }),
    check('grades_score_not_negative', sql`${table.score} is null or ${table.score} >= 0`),
  ],
);

/**
 * Work students hand in. Its scores live in a gradebook column of its own, so the gradebook stays
 * the one place a grade is stored.
 */
export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    columnId: uuid('column_id')
      .notNull()
      .unique()
      .references(() => gradeColumns.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ASSIGNMENT_KINDS }).notNull(),
    title: text('title').notNull(),
    instructions: text('instructions').notNull().default(''),
    dueAt: timestamp('due_at', { withTimezone: true }),
    allowLate: boolean('allow_late').notNull().default(true),
    /** Closed by hand: no more work is accepted, whatever the deadline says. */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
  },
  (table) => [index('assignments_group_idx').on(table.groupId, table.createdAt)],
);

export const assignmentAttachments = pgTable(
  'assignment_attachments',
  {
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .unique()
      .references(() => files.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (table) => [primaryKey({ columns: [table.assignmentId, table.fileId] })],
);

/** What one student handed in for one assignment; handing in again replaces it. */
export const submissions = pgTable(
  'submissions',
  {
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    late: boolean('late').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.assignmentId, table.studentId] })],
);

export const submissionFiles = pgTable(
  'submission_files',
  {
    assignmentId: uuid('assignment_id').notNull(),
    studentId: uuid('student_id').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .unique()
      .references(() => files.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.assignmentId, table.fileId] }),
    foreignKey({
      name: 'submission_files_submission_fk',
      columns: [table.assignmentId, table.studentId],
      foreignColumns: [submissions.assignmentId, submissions.studentId],
    }).onDelete('cascade'),
  ],
);

/** One reaction per person on a message, as in any messenger. */
export const messageReactions = pgTable(
  'message_reactions',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => groupMessages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    reactedAt: timestamp('reacted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.userId] })],
);

/** What each person is told about; kept in the app and, if they allow it, pushed. */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: notificationKind('kind').notNull(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    messageId: uuid('message_id').references(() => groupMessages.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id').references(() => announcements.id, {
      onDelete: 'cascade',
    }),
    gradeColumnId: uuid('grade_column_id').references(() => gradeColumns.id, {
      onDelete: 'cascade',
    }),
    assignmentId: uuid('assignment_id').references(() => assignments.id, { onDelete: 'cascade' }),
    excerpt: text('excerpt'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (table) => [index('notifications_user_idx').on(table.userId, table.createdAt)],
);

/** Browsers that may receive push notifications for a person. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    /** The interface language on that browser, so notifications arrive in it. */
    locale: text('locale', { enum: ['ar', 'en'] })
      .notNull()
      .default('ar'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('push_subscriptions_user_idx').on(table.userId)],
);

/** Which notifications reach a person's browsers; in-app ones are always kept. */
export const notificationSettings = pgTable('notification_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  mentions: boolean('mentions').notNull().default(true),
  announcements: boolean('announcements').notNull().default(true),
  polls: boolean('polls').notNull().default(true),
  grades: boolean('grades').notNull().default(true),
  assignments: boolean('assignments').notNull().default(true),
  messages: boolean('messages').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
export type Announcement = typeof announcements.$inferSelect;
export type GradeColumnRow = typeof gradeColumns.$inferSelect;
export type AssignmentRow = typeof assignments.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;
export type Poll = typeof polls.$inferSelect;
