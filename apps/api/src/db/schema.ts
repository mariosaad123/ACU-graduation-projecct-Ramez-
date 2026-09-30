import { DOCTOR_STATUSES, LEARNING_GOALS, LEARNING_LANGUAGES, USER_ROLES } from '@acu/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', USER_ROLES);
export const doctorStatus = pgEnum('doctor_status', DOCTOR_STATUSES);
export const learningLanguage = pgEnum('learning_language', LEARNING_LANGUAGES);
export const learningGoal = pgEnum('learning_goal', LEARNING_GOALS);

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
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
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
