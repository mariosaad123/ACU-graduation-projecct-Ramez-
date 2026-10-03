import * as z from 'zod/mini';
import { GROUP_MEMBER_STATUSES } from './groups';

/** The kinds of assessment a doctor records, so exports and averages can tell them apart. */
export const GRADE_COLUMN_KINDS = [
  'quiz',
  'assignment',
  'midterm',
  'final',
  'oral',
  'participation',
  'project',
  'other',
] as const;
export type GradeColumnKind = (typeof GRADE_COLUMN_KINDS)[number];

/** A cell holds a score, or marks the student absent or excused. */
export const GRADE_STATUSES = ['scored', 'absent', 'excused'] as const;
export type GradeStatus = (typeof GRADE_STATUSES)[number];

export const GRADE_MAX_SCORE = 1000;
export const GRADE_NOTE_MAX_LENGTH = 300;

/**
 * The grade scale used across Egyptian universities, by percentage: what a total turns into on the
 * gradebook and in exports.
 */
export const GRADE_BANDS = [
  { min: 85, band: 'excellent' },
  { min: 75, band: 'veryGood' },
  { min: 65, band: 'good' },
  { min: 50, band: 'pass' },
  { min: 0, band: 'fail' },
] as const;
export type GradeBand = (typeof GRADE_BANDS)[number]['band'];

export function bandOf(percent: number): GradeBand {
  return (GRADE_BANDS.find((entry) => percent >= entry.min) ?? GRADE_BANDS[4]).band;
}

const score = z.number().check(z.gte(0), z.lte(GRADE_MAX_SCORE));

export const gradeColumnInputSchema = z.object({
  title: z.string().check(z.trim(), z.minLength(1), z.maxLength(60)),
  kind: z.enum(GRADE_COLUMN_KINDS),
  maxScore: z.number().check(z.gt(0), z.lte(GRADE_MAX_SCORE)),
  /** Optional weight in the total, in percent; columns without one count by their score. */
  weight: z.nullable(z.number().check(z.gt(0), z.lte(100))),
  /** The day the quiz or task took place, "YYYY-MM-DD". */
  heldOn: z.nullable(z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/))),
  /** Published columns are visible to students, each seeing their own score. */
  published: z.boolean(),
});
export type GradeColumnInput = z.infer<typeof gradeColumnInputSchema>;

export const gradeColumnSchema = z.object({
  id: z.string(),
  ...gradeColumnInputSchema.shape,
  title: z.string(),
  position: z.number(),
  createdAt: z.string(),
});
export type GradeColumn = z.infer<typeof gradeColumnSchema>;

export const gradeInputSchema = z.object({
  status: z.enum(GRADE_STATUSES),
  score: z.nullable(score),
  note: z.nullable(z.string().check(z.trim(), z.maxLength(GRADE_NOTE_MAX_LENGTH))),
});
export type GradeInput = z.infer<typeof gradeInputSchema>;

export const gradeSchema = z.object({
  columnId: z.string(),
  studentId: z.string(),
  ...gradeInputSchema.shape,
  updatedAt: z.string(),
});
export type Grade = z.infer<typeof gradeSchema>;

/** What the group's staff see of one student's part in the group. */
export const activitySchema = z.object({
  messages: z.number(),
  messagesThisWeek: z.number(),
  lastMessageAt: z.nullable(z.string()),
  lastSeenAt: z.nullable(z.string()),
  announcementsRead: z.number(),
  pollsAnswered: z.number(),
  filesShared: z.number(),
  /** No message in the last seven days. */
  quiet: z.boolean(),
  /** Has not opened the group in the last seven days. */
  away: z.boolean(),
});
export type Activity = z.infer<typeof activitySchema>;

export const gradebookStudentSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  avatarUrl: z.nullable(z.string()),
  universityId: z.nullable(z.string()),
  status: z.enum(GROUP_MEMBER_STATUSES),
  joinedAt: z.string(),
  activity: activitySchema,
});
export type GradebookStudent = z.infer<typeof gradebookStudentSchema>;

export const gradebookSchema = z.object({
  columns: z.array(gradeColumnSchema),
  students: z.array(gradebookStudentSchema),
  grades: z.array(gradeSchema),
  totals: z.object({
    announcements: z.number(),
    polls: z.number(),
  }),
});
export type Gradebook = z.infer<typeof gradebookSchema>;

/** A student's own published grades in a group. */
export const myGradesSchema = z.object({
  columns: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      kind: z.enum(GRADE_COLUMN_KINDS),
      maxScore: z.number(),
      weight: z.nullable(z.number()),
      heldOn: z.nullable(z.string()),
      /** The class average of this column, among scored students. */
      average: z.nullable(z.number()),
      grade: z.nullable(gradeInputSchema),
    }),
  ),
});
export type MyGrades = z.infer<typeof myGradesSchema>;

interface TotalColumn {
  id: string;
  maxScore: number;
  weight: number | null;
}

/**
 * A student's total as a percentage. With weights, each column counts for its weight; without,
 * scores add up against the sum of the maximums. Excused cells leave the column out; absent ones
 * count as zero; empty cells are not counted yet. Null when nothing counts.
 */
export function totalPercent(
  columns: readonly TotalColumn[],
  gradeOf: (columnId: string) => Pick<GradeInput, 'status' | 'score'> | undefined,
): number | null {
  const weighted = columns.some((column) => column.weight !== null);
  let earned = 0;
  let possible = 0;
  for (const column of columns) {
    const grade = gradeOf(column.id);
    if (!grade || grade.status === 'excused') {
      continue;
    }
    if (grade.status === 'scored' && grade.score === null) {
      continue;
    }
    const fraction = grade.status === 'absent' ? 0 : (grade.score ?? 0) / column.maxScore;
    const share = weighted ? (column.weight ?? 0) : column.maxScore;
    earned += fraction * share;
    possible += share;
  }
  return possible === 0 ? null : (earned / possible) * 100;
}
