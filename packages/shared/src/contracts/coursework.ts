import * as z from 'zod/mini';
import { attachmentSchema } from './chat';
import { GRADE_MAX_SCORE, gradeInputSchema } from './gradebook';

/** Files a doctor attaches to an assignment, and files a student hands in with theirs. */
export const ASSIGNMENT_MAX_FILES = 5;
export const SUBMISSION_MAX_FILES = 5;
export const ASSIGNMENT_TEXT_MAX_LENGTH = 5000;

/** What is handed in: a weekly task or a larger project. Each gets a gradebook column of its kind. */
export const ASSIGNMENT_KINDS = ['assignment', 'project'] as const;
export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number];

/**
 * Where a student stands with an assignment: nothing handed in, handed in (on time or late), or
 * graded. A student sees "graded" only once the doctor releases the grades.
 */
export const SUBMISSION_STATES = ['missing', 'submitted', 'late', 'graded'] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];

export const assignmentInputSchema = z.object({
  title: z.string().check(z.trim(), z.minLength(1), z.maxLength(80)),
  instructions: z.string().check(z.trim(), z.maxLength(ASSIGNMENT_TEXT_MAX_LENGTH)),
  kind: z.enum(ASSIGNMENT_KINDS),
  maxScore: z.number().check(z.gt(0), z.lte(GRADE_MAX_SCORE)),
  /** The deadline; null leaves the assignment open until the doctor closes it. */
  dueAt: z.nullable(z.iso.datetime({ offset: true })),
  /** Work handed in after the deadline is accepted and marked late. */
  allowLate: z.boolean(),
});
export type AssignmentInput = z.infer<typeof assignmentInputSchema>;

/** Changing an assignment; `closed` stops submissions now, `released` shows students their grades. */
export const assignmentUpdateSchema = z.object({
  ...z.partial(assignmentInputSchema).shape,
  closed: z.optional(z.boolean()),
  released: z.optional(z.boolean()),
  /** Attachments to keep; any other is removed. Left out, they all stay. */
  keepFileIds: z.optional(z.array(z.string().check(z.uuid()))),
});
export type AssignmentUpdate = z.infer<typeof assignmentUpdateSchema>;

const submissionSchema = z.object({
  body: z.nullable(z.string()),
  files: z.array(attachmentSchema),
  submittedAt: z.string(),
  updatedAt: z.string(),
  late: z.boolean(),
});
export type Submission = z.infer<typeof submissionSchema>;

export const assignmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  instructions: z.string(),
  kind: z.enum(ASSIGNMENT_KINDS),
  maxScore: z.number(),
  dueAt: z.nullable(z.string()),
  allowLate: z.boolean(),
  closed: z.boolean(),
  /** Whether work can be handed in right now. */
  accepting: z.boolean(),
  attachments: z.array(attachmentSchema),
  author: z.object({ id: z.string(), name: z.string() }),
  createdAt: z.string(),
  edited: z.boolean(),
  /** The gradebook column its scores live in. */
  columnId: z.string(),
  /** A student's own part; null for the staff. */
  mine: z.nullable(
    z.object({
      state: z.enum(SUBMISSION_STATES),
      submission: z.nullable(submissionSchema),
      /** Set once the doctor releases the grades. */
      grade: z.nullable(gradeInputSchema),
      /** The work can still be handed in or changed. */
      canSubmit: z.boolean(),
    }),
  ),
  /** What the staff see at a glance; null for students. */
  progress: z.nullable(
    z.object({
      students: z.number(),
      submitted: z.number(),
      graded: z.number(),
      /** Students can see their scores. */
      released: z.boolean(),
    }),
  ),
});
export type Assignment = z.infer<typeof assignmentSchema>;

export const assignmentsResponseSchema = z.object({ assignments: z.array(assignmentSchema) });
export const assignmentResponseSchema = z.object({ assignment: assignmentSchema });

/** One student's row when the staff open an assignment. */
export const submissionRowSchema = z.object({
  student: z.object({
    id: z.string(),
    name: z.string(),
    avatarUrl: z.nullable(z.string()),
    universityId: z.nullable(z.string()),
  }),
  state: z.enum(SUBMISSION_STATES),
  submission: z.nullable(submissionSchema),
  grade: z.nullable(gradeInputSchema),
});
export type SubmissionRow = z.infer<typeof submissionRowSchema>;

export const assignmentDetailSchema = z.object({
  assignment: assignmentSchema,
  submissions: z.array(submissionRowSchema),
});
export type AssignmentDetail = z.infer<typeof assignmentDetailSchema>;

/** A student's text; files travel beside it as multipart parts. */
export const submissionInputSchema = z.object({
  body: z.string().check(z.trim(), z.maxLength(ASSIGNMENT_TEXT_MAX_LENGTH)),
  /** Files of the previous version to keep. */
  keepFileIds: z.array(z.string().check(z.uuid())).check(z.maxLength(SUBMISSION_MAX_FILES)),
});
export type SubmissionInput = z.infer<typeof submissionInputSchema>;

/** Why the staff remind a student, which decides the wording and where the reminder leads. */
export const NUDGE_REASONS = ['inactive', 'announcement', 'assignment'] as const;
export type NudgeReason = (typeof NUDGE_REASONS)[number];

/** A student is reminded about the same group at most once in this many hours. */
export const NUDGE_COOLDOWN_HOURS = 12;
export const NUDGE_NOTE_MAX_LENGTH = 200;

export const nudgeSchema = z.object({
  studentIds: z.array(z.string().check(z.uuid())).check(z.minLength(1), z.maxLength(500)),
  reason: z.enum(NUDGE_REASONS),
  /** The announcement or assignment the reminder is about. */
  targetId: z.optional(z.string().check(z.uuid())),
  note: z.optional(z.string().check(z.trim(), z.maxLength(NUDGE_NOTE_MAX_LENGTH))),
});
export type NudgeRequest = z.infer<typeof nudgeSchema>;

export const nudgeResponseSchema = z.object({
  sent: z.number(),
  /** Students reminded too recently to be reminded again. */
  skipped: z.number(),
});
export type NudgeResponse = z.infer<typeof nudgeResponseSchema>;

/**
 * What is waiting for someone across all their groups: for a student, assignments not handed in
 * yet; for the staff, handed-in work not graded yet.
 */
export const agendaSchema = z.object({
  toHandIn: z.array(
    z.object({
      assignmentId: z.string(),
      title: z.string(),
      groupId: z.string(),
      groupName: z.string(),
      dueAt: z.nullable(z.string()),
      /** The deadline has passed and late work is still taken. */
      overdue: z.boolean(),
    }),
  ),
  toGrade: z.array(
    z.object({
      assignmentId: z.string(),
      title: z.string(),
      groupId: z.string(),
      groupName: z.string(),
      waiting: z.number(),
    }),
  ),
});
export type Agenda = z.infer<typeof agendaSchema>;
