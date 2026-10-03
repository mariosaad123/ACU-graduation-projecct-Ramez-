import type { GradeInput, GradebookStudent } from '@acu/shared';

/** What a doctor may type in a cell for an absent or an excused student, in either language. */
export const ABSENT = ['غ', 'غائب', 'a', 'abs', 'absent'];
export const EXCUSED = ['ع', 'معذور', 'e', 'exc', 'excused'];

/** Arabic-Indic digits and the Arabic decimal comma, as a doctor may type them. */
export function toNumber(text: string): number | null {
  const western = text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[٫,]/g, '.');
  return /^\d+(\.\d{1,2})?$/.test(western) ? Number(western) : null;
}

export type CellProblem = 'invalid' | 'tooHigh';

/** What a typed cell means: a score, absent, excused, or nothing at all. */
export function readCell(
  text: string,
  maxScore: number,
): { input: Omit<GradeInput, 'note'> | null } | { problem: CellProblem } {
  const typed = text.trim().toLocaleLowerCase();
  if (typed === '') {
    return { input: null };
  }
  if (ABSENT.includes(typed)) {
    return { input: { status: 'absent', score: null } };
  }
  if (EXCUSED.includes(typed)) {
    return { input: { status: 'excused', score: null } };
  }
  const value = toNumber(typed);
  if (value === null) {
    return { problem: 'invalid' };
  }
  return value > maxScore ? { problem: 'tooHigh' } : { input: { status: 'scored', score: value } };
}

export interface PastedRow {
  /** The line as it was pasted, for the doctor to recognise it. */
  source: string;
  student: GradebookStudent | null;
  input: Omit<GradeInput, 'note'> | null;
  problem: CellProblem | 'unknownStudent' | 'repeated' | 'tooManyRows' | null;
}

const clean = (text: string) => text.trim().toLocaleLowerCase().replace(/\s+/g, ' ');

/**
 * Reads grades copied from a spreadsheet. A single column is taken in the order of the sheet on
 * screen. With two or more columns, the last one is the score and the others name the student, by
 * university number, email or name, so the order of the rows does not matter.
 */
export function readPastedGrades(
  text: string,
  students: readonly GradebookStudent[],
  maxScore: number,
): PastedRow[] {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.trim() !== '');
  const split = (line: string) =>
    (line.includes('\t') ? line.split('\t') : line.split(/[;,]|\s{2,}/)).map((cell) => cell.trim());
  const named = lines.some((line) => split(line).filter(Boolean).length > 1);
  const seen = new Set<string>();

  return lines.map((line, index) => {
    const cells = split(line).filter(Boolean);
    const scoreText = cells.at(-1) ?? '';
    let student: GradebookStudent | null;
    if (named) {
      const keys = cells.slice(0, -1).map(clean);
      student =
        students.find(
          (candidate) =>
            (candidate.universityId !== null && keys.includes(clean(candidate.universityId))) ||
            keys.includes(clean(candidate.email)),
        ) ??
        students.find((candidate) => keys.includes(clean(candidate.name))) ??
        null;
    } else {
      student = students[index] ?? null;
    }

    const row: PastedRow = { source: line.trim(), student, input: null, problem: null };
    if (!student) {
      row.problem = named ? 'unknownStudent' : 'tooManyRows';
      return row;
    }
    if (seen.has(student.id)) {
      row.problem = 'repeated';
      return row;
    }
    seen.add(student.id);
    const cell = readCell(named && cells.length < 2 ? '' : scoreText, maxScore);
    if ('problem' in cell) {
      row.problem = cell.problem;
    } else {
      row.input = cell.input;
    }
    return row;
  });
}
